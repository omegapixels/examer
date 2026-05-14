'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Exam, Question, Answer } from '@/lib/supabase'

type QuestionWithAnswers = Question & { answers: Answer[] }

type Phase = 'loading' | 'not_found' | 'inactive' | 'intro' | 'exam' | 'finished'

// Extended result type that includes review data
type QuestionResult = {
  question: QuestionWithAnswers
  selectedAnswerId: string | null
  correctAnswerId: string
  isCorrect: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ExamPage() {
  const { examId } = useParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [exam, setExam] = useState<Exam | null>(null)
  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([])
  const [shuffledAnswers, setShuffledAnswers] = useState<Record<string, Answer[]>>({})

  const [studentName, setStudentName] = useState('')
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<Date | null>(null)

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Results
  const [score, setScore] = useState(0)
  const [totalPoints, setTotalPoints] = useState(0)
  const [passed, setPassed] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])

  // Review state
  const [showReview, setShowReview] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'wrong' | 'unanswered'>('all')

  useEffect(() => {
    const fetchExam = async () => {
      const { data: examData } = await supabase.from('exams').select('*').eq('id', examId).single()
      if (!examData) { setPhase('not_found'); return }
      if (!examData.is_active) { setPhase('inactive'); return }

      const { data: qData } = await supabase
        .from('questions')
        .select('*, answers(*)')
        .eq('exam_id', examId)
        .order('order_index')

      setExam(examData)
      if (qData) {
        setQuestions(qData)
        const shuffled: Record<string, Answer[]> = {}
        qData.forEach((q: QuestionWithAnswers) => {
          shuffled[q.id] = shuffle(q.answers)
        })
        setShuffledAnswers(shuffled)
      }
      setPhase('intro')
    }
    fetchExam()
  }, [examId])

  const finishExam = useCallback(async (answers: Record<string, string>, forced = false) => {
    if (!sessionId || !exam) return
    if (timerRef.current) clearInterval(timerRef.current)

    const endTime = new Date()
    const timeTaken = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : null

    let earnedScore = 0
    const totalPts = questions.reduce((acc, q) => acc + q.points, 0)
    const studentAnswerRows = []
    const results: QuestionResult[] = []

    for (const q of questions) {
      const selectedAnswerId = answers[q.id] || null
      const selectedAnswer = q.answers.find(a => a.id === selectedAnswerId)
      const correctAnswer = q.answers.find(a => a.is_correct)
      const isCorrect = selectedAnswer?.is_correct || false
      if (isCorrect) earnedScore += q.points

      studentAnswerRows.push({
        session_id: sessionId,
        question_id: q.id,
        answer_id: selectedAnswerId || null,
        is_correct: isCorrect
      })

      results.push({
        question: q,
        selectedAnswerId,
        correctAnswerId: correctAnswer?.id || '',
        isCorrect
      })
    }

    const percentage = totalPts > 0 ? (earnedScore / totalPts) * 100 : 0
    const didPass = percentage >= (exam.pass_score || 50)

    await supabase.from('student_answers').insert(studentAnswerRows)
    await supabase.from('exam_sessions').update({
      finished_at: endTime.toISOString(),
      score: earnedScore,
      total_points: totalPts,
      percentage,
      passed: didPass,
      time_taken: timeTaken
    }).eq('id', sessionId)

    setScore(earnedScore)
    setTotalPoints(totalPts)
    setPassed(didPass)
    setQuestionResults(results)
    if (didPass) setShowConfetti(true)
    setPhase('finished')
  }, [sessionId, exam, questions, startTime])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'exam' || !exam?.time_limit) return
    setTimeLeft(exam.time_limit * 60)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          finishExam(selectedAnswers, true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, exam?.time_limit])

  const startExam = async () => {
    if (!studentName.trim() || !exam) return
    const { data } = await supabase
      .from('exam_sessions')
      .insert({ exam_id: examId, student_name: studentName.trim() })
      .select()
      .single()
    if (data) {
      setSessionId(data.id)
      setStartTime(new Date())
      setPhase('exam')
    }
  }

  const selectAnswer = (questionId: string, answerId: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: answerId }))
  }

  const goNext = () => {
    if (currentQ < questions.length - 1) setCurrentQ(prev => prev + 1)
  }
  const goPrev = () => {
    if (currentQ > 0) setCurrentQ(prev => prev - 1)
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const answeredCount = Object.keys(selectedAnswers).length
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0
  const isTimeWarning = timeLeft !== null && timeLeft < 60

  // ============ PHASES ============

  if (phase === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
        <div style={{ fontWeight: 600 }}>جار تحميل الامتحان...</div>
      </div>
    </div>
  )

  if (phase === 'not_found') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>الامتحان غير موجود</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>تحقق من الرابط وحاول مجدداً</div>
      </div>
    </div>
  )

  if (phase === 'inactive') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏸️</div>
        <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>الامتحان غير متاح حالياً</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>تواصل مع المعلم للمزيد من المعلومات</div>
      </div>
    </div>
  )

  if (phase === 'intro') return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div className="card animate-fade" style={{ maxWidth: 500, width: '100%', textAlign: 'center', padding: '2.5rem 2rem' }}>
        <div style={{
          width: 72, height: 72,
          background: 'linear-gradient(135deg, var(--primary), #7C3AED)',
          borderRadius: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem',
          margin: '0 auto 1.5rem'
        }}>📝</div>

        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>{exam?.title}</h1>
        {exam?.description && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>{exam.description}</p>
        )}

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '2rem'
        }}>
          <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>📋 {questions.length} سؤال</span>
          </div>
          {exam?.time_limit && (
            <div style={{ background: '#FEF3C7', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#92400E', fontWeight: 600 }}>⏱ {exam.time_limit} دقيقة</span>
            </div>
          )}
          <div style={{ background: '#D1FAE5', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#065F46', fontWeight: 600 }}>🎯 النجاح: {exam?.pass_score}%</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
          <label className="label">اسمك الكامل *</label>
          <input
            className="input"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startExam()}
            placeholder="أدخل اسمك هنا..."
            style={{ fontSize: '1rem' }}
            autoFocus
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={startExam}
          disabled={!studentName.trim()}
          style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', fontSize: '1rem', opacity: studentName.trim() ? 1 : 0.6 }}
        >
          🚀 بدء الامتحان
        </button>
      </div>
    </div>
  )

  if (phase === 'exam') {
    const q = questions[currentQ]
    const answers = shuffledAnswers[q.id] || q.answers
    const selectedForThis = selectedAnswers[q.id]

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{
          background: 'white',
          borderBottom: '1px solid var(--border)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          flexWrap: 'wrap'
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, minWidth: 100 }}>{exam?.title}</div>

          {/* Progress bar */}
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${((currentQ + 1) / questions.length) * 100}%`,
                background: 'linear-gradient(90deg, var(--primary), #7C3AED)',
                borderRadius: 3,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, textAlign: 'center' }}>
              {currentQ + 1} من {questions.length} — أجبت على {answeredCount}
            </div>
          </div>

          {/* Timer */}
          {timeLeft !== null && (
            <div style={{
              background: isTimeWarning ? '#FEE2E2' : 'var(--surface-2)',
              color: isTimeWarning ? 'var(--danger)' : 'var(--text)',
              padding: '0.4rem 0.8rem',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '1rem',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 70,
              textAlign: 'center',
              transition: 'all 0.3s'
            }}>
              ⏱ {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Question */}
        <div style={{ flex: 1, maxWidth: 680, width: '100%', margin: '0 auto', padding: '2rem 1rem' }}>
          <div className="card animate-fade" key={q.id}>
            {/* Question header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 32, height: 32, background: 'linear-gradient(135deg, var(--primary), #7C3AED)',
                  color: 'white', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.85rem', flexShrink: 0
                }}>{currentQ + 1}</div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>السؤال {currentQ + 1} من {questions.length}</span>
              </div>
              <span className="badge badge-blue">{q.points} {q.points === 1 ? 'علامة' : 'علامات'}</span>
            </div>

            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.6 }}>
              {q.question_text}
            </h2>

            {/* Answers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {answers.map((answer, ai) => {
                const isSelected = selectedForThis === answer.id
                return (
                  <button
                    key={answer.id}
                    onClick={() => selectAnswer(q.id, answer.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 10,
                      background: isSelected ? 'var(--primary-light)' : 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'right',
                      width: '100%',
                      fontFamily: 'Rubik, sans-serif',
                      fontSize: '0.92rem',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--primary-dark)' : 'var(--text)',
                      transition: 'all 0.15s ease',
                      transform: isSelected ? 'scale(1.01)' : 'scale(1)'
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary)' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s'
                    }}>
                      {isSelected && <span style={{ color: 'white', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                      {!isSelected && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
                        {String.fromCharCode(1575 + ai)}
                      </span>}
                    </div>
                    <span style={{ flex: 1 }}>{answer.answer_text}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={goPrev}
              disabled={currentQ === 0}
              style={{ opacity: currentQ === 0 ? 0.4 : 1 }}
            >
              → السابق
            </button>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  style={{
                    width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: i === currentQ ? 'var(--primary)' : selectedAnswers[questions[i].id] ? '#D1FAE5' : 'var(--border)',
                    color: i === currentQ ? 'white' : selectedAnswers[questions[i].id] ? '#065F46' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.8rem',
                    transition: 'all 0.15s'
                  }}
                >{i + 1}</button>
              ))}
            </div>

            {currentQ < questions.length - 1 ? (
              <button className="btn btn-primary" onClick={goNext}>
                التالي ←
              </button>
            ) : (
              <button
                className="btn btn-success"
                onClick={() => {
                  if (answeredCount < questions.length) {
                    const unanswered = questions.length - answeredCount
                    if (!confirm(`لديك ${unanswered} سؤال لم تجب عليه. هل تريد إنهاء الامتحان؟`)) return
                  }
                  finishExam(selectedAnswers)
                }}
              >
                ✓ إنهاء الامتحان
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0
    const correctCount = questionResults.filter(r => r.isCorrect).length
    const wrongCount = questionResults.filter(r => !r.isCorrect && r.selectedAnswerId).length
    const unansweredCount = questionResults.filter(r => !r.selectedAnswerId).length

    const filteredResults = questionResults.filter(r => {
      if (reviewFilter === 'correct') return r.isCorrect
      if (reviewFilter === 'wrong') return !r.isCorrect && r.selectedAnswerId
      if (reviewFilter === 'unanswered') return !r.selectedAnswerId
      return true
    })

    return (
      <div style={{
        minHeight: '100vh',
        background: passed
          ? 'linear-gradient(135deg, #ECFDF5 0%, #EFF6FF 100%)'
          : 'linear-gradient(135deg, #FFF1F2 0%, #FEF3C7 100%)',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Confetti effect */}
        {showConfetti && Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{
            position: 'fixed',
            top: '-10%',
            left: `${Math.random() * 100}%`,
            width: 10,
            height: 10,
            background: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#7C3AED'][i % 5],
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            animation: `confetti ${2 + Math.random() * 3}s ${Math.random() * 2}s ease-in forwards`,
            zIndex: 0
          }} />
        ))}

        <div style={{ maxWidth: 680, margin: '0 auto', position: 'relative', zIndex: 1 }}>

          {/* ===== RESULT CARD ===== */}
          <div className="card animate-bounce-in" style={{
            textAlign: 'center',
            padding: '2.5rem 2rem',
            marginBottom: '1.5rem'
          }}>
            {/* Result icon */}
            <div style={{
              width: 90, height: 90,
              background: passed
                ? 'linear-gradient(135deg, var(--success), #059669)'
                : 'linear-gradient(135deg, #F87171, var(--danger))',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2.5rem',
              margin: '0 auto 1.5rem',
              boxShadow: passed
                ? '0 8px 32px rgba(16,185,129,0.3)'
                : '0 8px 32px rgba(239,68,68,0.3)'
            }}>
              {passed ? '🏆' : '📚'}
            </div>

            <h1 style={{
              margin: '0 0 0.5rem',
              fontSize: '1.6rem',
              fontWeight: 800,
              color: passed ? '#065F46' : '#991B1B'
            }}>
              {passed ? `أحسنت يا ${studentName}! 🎉` : `حاول مجدداً يا ${studentName}`}
            </h1>

            <p style={{ color: 'var(--text-muted)', margin: '0 0 2rem', fontSize: '0.95rem' }}>
              {passed ? 'لقد اجتزت الامتحان بنجاح!' : 'لم تتجاوز حد النجاح هذه المرة'}
            </p>

            {/* Score circle */}
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 1.5rem' }}>
              <svg viewBox="0 0 120 120" width="120" height="120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={passed ? 'var(--success)' : 'var(--danger)'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - percentage / 100)}`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: passed ? 'var(--success)' : 'var(--danger)' }}>{percentage}%</span>
              </div>
            </div>

            {/* Score stats grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '0.75rem 0.5rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{score}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>علامتك</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '0.75rem 0.5rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)' }}>{totalPoints}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>الكاملة</div>
              </div>
              <div style={{ background: '#D1FAE5', borderRadius: 10, padding: '0.75rem 0.5rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#065F46' }}>{correctCount}</div>
                <div style={{ fontSize: '0.7rem', color: '#065F46' }}>صحيحة</div>
              </div>
              <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '0.75rem 0.5rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991B1B' }}>{wrongCount + unansweredCount}</div>
                <div style={{ fontSize: '0.7rem', color: '#991B1B' }}>خاطئة/فارغة</div>
              </div>
            </div>

            <div style={{
              padding: '0.75rem',
              borderRadius: 8,
              background: passed ? '#D1FAE5' : '#FEE2E2',
              color: passed ? '#065F46' : '#991B1B',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '1.5rem'
            }}>
              {passed ? `✅ ناجح — تجاوزت نسبة ${exam?.pass_score}% المطلوبة` : `❌ لم تصل إلى نسبة ${exam?.pass_score}% المطلوبة`}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', padding: '0.85rem' }}
                onClick={() => setShowReview(!showReview)}
              >
                {showReview ? '🔼 إخفاء المراجعة' : '🔍 مراجعة إجاباتي'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'center', padding: '0.85rem' }}
                onClick={() => window.location.reload()}
              >
                🔄 إعادة
              </button>
            </div>
          </div>

          {/* ===== REVIEW SECTION ===== */}
          {showReview && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {/* Filter tabs */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1rem',
                flexWrap: 'wrap'
              }}>
                {([
                  { key: 'all', label: `الكل (${questionResults.length})`, color: 'var(--primary)' },
                  { key: 'correct', label: `✅ صحيحة (${correctCount})`, color: '#059669' },
                  { key: 'wrong', label: `❌ خاطئة (${wrongCount})`, color: '#DC2626' },
                  { key: 'unanswered', label: `⬜ لم تُجب (${unansweredCount})`, color: '#6B7280' },
                ] as { key: typeof reviewFilter, label: string, color: string }[]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setReviewFilter(tab.key)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: 20,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      fontFamily: 'Rubik, sans-serif',
                      background: reviewFilter === tab.key ? tab.color : 'white',
                      color: reviewFilter === tab.key ? 'white' : 'var(--text-muted)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                      transition: 'all 0.15s'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Questions review */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredResults.map((result, idx) => {
                  const { question, selectedAnswerId, correctAnswerId, isCorrect } = result
                  const unanswered = !selectedAnswerId

                  const statusColor = isCorrect ? '#059669' : unanswered ? '#6B7280' : '#DC2626'
                  const statusBg = isCorrect ? '#D1FAE5' : unanswered ? '#F3F4F6' : '#FEE2E2'
                  const statusIcon = isCorrect ? '✅' : unanswered ? '⬜' : '❌'
                  const statusLabel = isCorrect ? 'إجابة صحيحة' : unanswered ? 'لم تجب' : 'إجابة خاطئة'

                  return (
                    <div key={question.id} className="card" style={{ padding: '1.25rem', borderRight: `4px solid ${statusColor}` }}>
                      {/* Question header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: statusBg,
                            color: statusColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, flexShrink: 0
                          }}>
                            {questionResults.indexOf(result) + 1}
                          </div>
                          <span style={{
                            fontSize: '0.78rem', fontWeight: 600,
                            padding: '0.25rem 0.6rem',
                            borderRadius: 12,
                            background: statusBg,
                            color: statusColor
                          }}>
                            {statusIcon} {statusLabel}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {question.points} {question.points === 1 ? 'علامة' : 'علامات'}
                        </span>
                      </div>

                      {/* Question text */}
                      <p style={{ margin: '0 0 1rem', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.6 }}>
                        {question.question_text}
                      </p>

                      {/* Answers */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {question.answers.map(answer => {
                          const isCorrectAnswer = answer.id === correctAnswerId
                          const isStudentAnswer = answer.id === selectedAnswerId
                          const isWrongStudentAnswer = isStudentAnswer && !isCorrectAnswer

                          let bg = 'var(--surface-2)'
                          let border = 'transparent'
                          let color = 'var(--text-muted)'
                          let icon = null

                          if (isCorrectAnswer) {
                            bg = '#D1FAE5'
                            border = '#059669'
                            color = '#065F46'
                            icon = '✓'
                          }
                          if (isWrongStudentAnswer) {
                            bg = '#FEE2E2'
                            border = '#DC2626'
                            color = '#991B1B'
                            icon = '✗'
                          }

                          return (
                            <div
                              key={answer.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                padding: '0.65rem 0.85rem',
                                borderRadius: 8,
                                background: bg,
                                border: `1.5px solid ${border}`,
                                fontSize: '0.88rem',
                                color,
                                fontWeight: (isCorrectAnswer || isWrongStudentAnswer) ? 600 : 400
                              }}
                            >
                              {icon && (
                                <span style={{
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: isCorrectAnswer ? '#059669' : '#DC2626',
                                  color: 'white',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.7rem', fontWeight: 900, flexShrink: 0
                                }}>
                                  {icon}
                                </span>
                              )}
                              {!icon && <span style={{ width: 20, flexShrink: 0 }} />}
                              <span style={{ flex: 1 }}>{answer.answer_text}</span>
                              {isCorrectAnswer && !isStudentAnswer && (
                                <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  الإجابة الصحيحة
                                </span>
                              )}
                              {isWrongStudentAnswer && (
                                <span style={{ fontSize: '0.72rem', color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  إجابتك
                                </span>
                              )}
                              {isCorrectAnswer && isStudentAnswer && (
                                <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  إجابتك ✓
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {filteredResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                  <div>لا توجد أسئلة في هذا التصنيف</div>
                </div>
              )}
            </div>
          )}
        </div>

        <style jsx global>{`
          @keyframes confetti {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  return null
}
