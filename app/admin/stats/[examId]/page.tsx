'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────
type ExamSession = {
  id: string
  student_name: string
  started_at: string
  finished_at: string | null
  score: number | null
  total_points: number | null
  percentage: number | null
  passed: boolean | null
  time_taken: number | null
}

type StudentAnswer = {
  id: string
  session_id: string
  question_id: string
  answer_id: string | null
  is_correct: boolean
}

type Answer = {
  id: string
  answer_text: string
  is_correct: boolean
}

type Question = {
  id: string
  question_text: string
  points: number
  order_index: number
  answers: Answer[]
}

type QuestionStat = {
  question: Question
  totalAnswered: number
  correctCount: number
  wrongCount: number
  unansweredCount: number
  correctRate: number
  answerDistribution: { answer: Answer; count: number; percentage: number }[]
}

type ExamInfo = {
  id: string
  title: string
  pass_score: number
  time_limit: number | null
}

// ── Helpers ────────────────────────────────────────────
function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}ث`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}د ${s}ث` : `${m} دقيقة`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ── Main Component ─────────────────────────────────────
export default function AdvancedStatsPage() {
  const { examId } = useParams()

  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([])
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'students'>('overview')
  const [sortQuestions, setSortQuestions] = useState<'order' | 'wrong_rate' | 'correct_rate'>('wrong_rate')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      // Step 1: fetch exam info and questions in parallel (no dependency on sessions)
      const [{ data: examData }, { data: sessionsData }, { data: questionsData }] =
        await Promise.all([
          supabase.from('exams').select('id, title, pass_score, time_limit').eq('id', examId).single(),
          supabase.from('exam_sessions').select('*').eq('exam_id', examId).not('finished_at', 'is', null).order('started_at', { ascending: false }),
          supabase.from('questions').select('*, answers(*)').eq('exam_id', examId).order('order_index'),
        ])

      setExam(examData)
      setSessions(sessionsData || [])
      setQuestions(questionsData || [])

      // Step 2: fetch student answers only if there are completed sessions
      if (sessionsData && sessionsData.length > 0) {
        const sessionIds = sessionsData.map((s: ExamSession) => s.id)
        const { data: answersData } = await supabase
          .from('student_answers')
          .select('*')
          .in('session_id', sessionIds)

        setStudentAnswers(answersData || [])
      }

      setLoading(false)
    }

    fetchData()
  }, [examId])

  // ── Computed stats ───────────────────────────────────
  const completedSessions = sessions.filter(s => s.finished_at)
  const passedSessions = completedSessions.filter(s => s.passed)
  const failedSessions = completedSessions.filter(s => s.passed === false)

  const avgScore = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.percentage || 0), 0) / completedSessions.length)
    : 0

  const avgTime = completedSessions.filter(s => s.time_taken).length > 0
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.time_taken || 0), 0) / completedSessions.filter(s => s.time_taken).length)
    : 0

  const passRate = completedSessions.length > 0
    ? Math.round((passedSessions.length / completedSessions.length) * 100)
    : 0

  // Per-question stats
  const questionStats: QuestionStat[] = questions.map(q => {
    const qAnswers = studentAnswers.filter(a => a.question_id === q.id)
    const totalAnswered = qAnswers.filter(a => a.answer_id).length
    const unansweredCount = qAnswers.length - totalAnswered
    const correctCount = qAnswers.filter(a => a.is_correct).length
    const wrongCount = totalAnswered - correctCount
    const correctRate = qAnswers.length > 0 ? Math.round((correctCount / qAnswers.length) * 100) : 0

    const answerDistribution = q.answers.map(ans => {
      const count = qAnswers.filter(a => a.answer_id === ans.id).length
      return {
        answer: ans,
        count,
        percentage: qAnswers.length > 0 ? Math.round((count / qAnswers.length) * 100) : 0
      }
    }).sort((a, b) => b.count - a.count)

    return {
      question: q,
      totalAnswered,
      correctCount,
      wrongCount,
      unansweredCount,
      correctRate,
      answerDistribution
    }
  })

  const sortedQuestionStats = [...questionStats].sort((a, b) => {
    if (sortQuestions === 'wrong_rate') return (100 - a.correctRate) - (100 - b.correctRate)
    if (sortQuestions === 'correct_rate') return b.correctRate - a.correctRate
    return a.question.order_index - b.question.order_index
  })

  // Score distribution buckets
  const buckets = [
    { label: '0–20%', min: 0, max: 20 },
    { label: '21–40%', min: 21, max: 40 },
    { label: '41–60%', min: 41, max: 60 },
    { label: '61–80%', min: 61, max: 80 },
    { label: '81–100%', min: 81, max: 100 },
  ]
  const scoreDistribution = buckets.map(b => ({
    ...b,
    count: completedSessions.filter(s => (s.percentage || 0) >= b.min && (s.percentage || 0) <= b.max).length
  }))
  const maxBucketCount = Math.max(...scoreDistribution.map(b => b.count), 1)

  // ── Render ───────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
        <div style={{ fontWeight: 600 }}>جار تحميل الإحصائيات...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/admin" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{exam?.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>الإحصائيات المتقدمة</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/admin/results/${examId}`} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>
            📋 النتائج الأساسية
          </Link>
          <Link href={`/admin/edit/${examId}`} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>
            ✏️ تعديل الامتحان
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>

        {/* ── KPI Row ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {[
            { label: 'إجمالي المشاركين', value: completedSessions.length, icon: '👥', bg: '#DBEAFE', color: '#1D4ED8' },
            { label: 'نسبة النجاح', value: `${passRate}%`, icon: '✅', bg: '#D1FAE5', color: '#065F46' },
            { label: 'متوسط الدرجات', value: `${avgScore}%`, icon: '📈', bg: '#EDE9FE', color: '#5B21B6' },
            { label: 'متوسط الوقت', value: avgTime > 0 ? formatDuration(avgTime) : '—', icon: '⏱', bg: '#FEF3C7', color: '#92400E' },
            { label: 'ناجحون', value: passedSessions.length, icon: '🏆', bg: '#D1FAE5', color: '#065F46' },
            { label: 'راسبون', value: failedSessions.length, icon: '📚', bg: '#FEE2E2', color: '#991B1B' },
          ].map((kpi, i) => (
            <div key={i} className="card" style={{ padding: '1.1rem', textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: kpi.bg, fontSize: '1.3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 0.6rem'
              }}>{kpi.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'var(--surface-2)', borderRadius: 10, padding: '0.25rem' }}>
          {([
            { key: 'overview', label: '📊 نظرة عامة' },
            { key: 'questions', label: '❓ تحليل الأسئلة' },
            { key: 'students', label: '👤 الطلاب' },
          ] as { key: typeof activeTab, label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'Rubik, sans-serif',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.15s',
                background: activeTab === tab.key ? 'white' : 'transparent',
                color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════ TAB: OVERVIEW ══════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Pass/Fail bar */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>توزيع النتائج</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                    <span style={{ color: '#065F46', fontWeight: 600 }}>✅ ناجحون ({passedSessions.length})</span>
                    <span style={{ color: '#991B1B', fontWeight: 600 }}>❌ راسبون ({failedSessions.length})</span>
                  </div>
                  <div style={{ height: 20, borderRadius: 10, background: '#FEE2E2', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${passRate}%`,
                      background: 'linear-gradient(90deg, #10B981, #059669)',
                      borderRadius: 10,
                      transition: 'width 0.8s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {passRate > 15 && (
                        <span style={{ color: 'white', fontSize: '0.72rem', fontWeight: 700 }}>{passRate}%</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score distribution chart */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', fontWeight: 700 }}>توزيع الدرجات</h3>
              {completedSessions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>لا توجد بيانات بعد</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 140 }}>
                  {scoreDistribution.map(bucket => {
                    const height = maxBucketCount > 0 ? (bucket.count / maxBucketCount) * 100 : 0
                    const isPassZone = bucket.min >= (exam?.pass_score || 50)
                    return (
                      <div key={bucket.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isPassZone ? '#059669' : '#DC2626' }}>
                          {bucket.count > 0 ? bucket.count : ''}
                        </div>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(height, bucket.count > 0 ? 8 : 0)}%`,
                          background: isPassZone
                            ? 'linear-gradient(180deg, #10B981, #059669)'
                            : 'linear-gradient(180deg, #F87171, #DC2626)',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.6s ease',
                          minHeight: bucket.count > 0 ? 4 : 0
                        }} />
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>{bucket.label}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Most wrong questions preview */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>⚠️ أكثر الأسئلة إجابةً بشكل خاطئ</h3>
                <button onClick={() => setActiveTab('questions')} style={{ fontSize: '0.78rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600 }}>
                  عرض الكل ←
                </button>
              </div>
              {questionStats.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>لا توجد بيانات بعد</div>
              ) : (
                [...questionStats]
                  .filter(s => s.unansweredCount < s.question.answers.length) // has at least some answers
                  .sort((a, b) => a.correctRate - b.correctRate)
                  .slice(0, 5)
                  .map((stat, i) => (
                    <div key={stat.question.id} style={{
                      padding: '1rem 1.5rem',
                      borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                      display: 'flex', alignItems: 'center', gap: '1rem'
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: stat.correctRate < 30 ? '#FEE2E2' : stat.correctRate < 60 ? '#FEF3C7' : '#D1FAE5',
                        color: stat.correctRate < 30 ? '#DC2626' : stat.correctRate < 60 ? '#92400E' : '#059669',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.75rem', flexShrink: 0
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stat.question.question_text}
                        </div>
                        <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginTop: '0.4rem' }}>
                          <div style={{
                            height: '100%',
                            width: `${stat.correctRate}%`,
                            background: stat.correctRate < 30
                              ? 'linear-gradient(90deg, #F87171, #DC2626)'
                              : stat.correctRate < 60
                                ? 'linear-gradient(90deg, #FCD34D, #F59E0B)'
                                : 'linear-gradient(90deg, #34D399, #10B981)',
                            borderRadius: 3
                          }} />
                        </div>
                      </div>
                      <div style={{
                        fontWeight: 800, fontSize: '0.9rem',
                        color: stat.correctRate < 30 ? '#DC2626' : stat.correctRate < 60 ? '#92400E' : '#059669',
                        minWidth: 40, textAlign: 'left'
                      }}>
                        {stat.correctRate}%
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* ══════════ TAB: QUESTIONS ══════════ */}
        {activeTab === 'questions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Sort control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>ترتيب حسب:</span>
              {([
                { key: 'wrong_rate', label: 'الأكثر خطأً أولاً' },
                { key: 'correct_rate', label: 'الأكثر صحةً أولاً' },
                { key: 'order', label: 'ترتيب الأسئلة' },
              ] as { key: typeof sortQuestions, label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortQuestions(opt.key)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: 16,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Rubik, sans-serif',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: sortQuestions === opt.key ? 'var(--primary)' : 'white',
                    color: sortQuestions === opt.key ? 'white' : 'var(--text-muted)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    transition: 'all 0.15s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {sortedQuestionStats.length === 0 && (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                <div>لا توجد إجابات مسجلة بعد</div>
              </div>
            )}

            {sortedQuestionStats.map((stat, idx) => {
              const danger = stat.correctRate < 30
              const warning = stat.correctRate >= 30 && stat.correctRate < 60
              const good = stat.correctRate >= 60

              const cardBorder = danger ? '#EF4444' : warning ? '#F59E0B' : '#10B981'
              const rateColor = danger ? '#DC2626' : warning ? '#92400E' : '#059669'
              const rateBg = danger ? '#FEE2E2' : warning ? '#FEF3C7' : '#D1FAE5'

              return (
                <div key={stat.question.id} className="card" style={{ padding: '0', overflow: 'hidden', borderRight: `4px solid ${cardBorder}` }}>
                  {/* Question header */}
                  <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                        <span style={{
                          background: rateBg, color: rateColor,
                          fontWeight: 700, fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem', borderRadius: 6, whiteSpace: 'nowrap'
                        }}>
                          س {stat.question.order_index + 1}
                        </span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.5 }}>
                          {stat.question.question_text}
                        </span>
                      </div>
                      <div style={{
                        background: rateBg, color: rateColor,
                        fontWeight: 800, fontSize: '1rem',
                        padding: '0.3rem 0.75rem', borderRadius: 8,
                        whiteSpace: 'nowrap', flexShrink: 0
                      }}>
                        {stat.correctRate}% صحيحة
                      </div>
                    </div>

                    {/* Mini stats row */}
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>👥 أجاب {stat.question.answers.length > 0 ? completedSessions.length : 0} طالب</span>
                      <span style={{ color: '#059669' }}>✅ صحيح: {stat.correctCount}</span>
                      <span style={{ color: '#DC2626' }}>❌ خطأ: {stat.wrongCount}</span>
                      {stat.unansweredCount > 0 && <span style={{ color: '#6B7280' }}>⬜ لم يجب: {stat.unansweredCount}</span>}
                    </div>
                  </div>

                  {/* Answer distribution */}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {stat.answerDistribution.map(({ answer, count, percentage }) => {
                      const isCorrect = answer.is_correct
                      const barColor = isCorrect
                        ? 'linear-gradient(90deg, #34D399, #10B981)'
                        : 'linear-gradient(90deg, #FCA5A5, #F87171)'

                      return (
                        <div key={answer.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', gap: '0.5rem' }}>
                            <span style={{
                              fontSize: '0.83rem',
                              color: isCorrect ? '#065F46' : 'var(--text)',
                              fontWeight: isCorrect ? 700 : 400,
                              flex: 1,
                              display: 'flex', alignItems: 'center', gap: '0.35rem'
                            }}>
                              {isCorrect && <span style={{ fontSize: '0.7rem', background: '#D1FAE5', color: '#059669', padding: '0.1rem 0.35rem', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>✓ صحيحة</span>}
                              {answer.answer_text}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isCorrect ? '#059669' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {count} ({percentage}%)
                            </span>
                          </div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${percentage}%`,
                              background: barColor,
                              borderRadius: 4,
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════ TAB: STUDENTS ══════════ */}
        {activeTab === 'students' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>سجل الطلاب ({completedSessions.length})</h3>
            </div>

            {completedSessions.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👥</div>
                <div style={{ fontWeight: 600 }}>لا يوجد طلاب بعد</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['الطالب', 'الدرجة', 'النتيجة', 'الوقت', 'التاريخ'].map(h => (
                        <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completedSessions.map((session, idx) => {
                      const pct = Math.round(session.percentage || 0)
                      return (
                        <tr key={session.id} style={{ borderBottom: idx < completedSessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: session.passed ? '#D1FAE5' : '#FEE2E2',
                                color: session.passed ? '#065F46' : '#991B1B',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.75rem', flexShrink: 0
                              }}>
                                {session.student_name.charAt(0)}
                              </div>
                              {session.student_name}
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', width: `${pct}%`,
                                  background: session.passed ? 'var(--success)' : 'var(--danger)',
                                  borderRadius: 3
                                }} />
                              </div>
                              <span style={{ fontWeight: 700, color: session.passed ? '#059669' : '#DC2626' }}>{pct}%</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {session.score}/{session.total_points} علامة
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className={`badge ${session.passed ? 'badge-green' : 'badge-red'}`}>
                              {session.passed ? '✅ ناجح' : '❌ راسب'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                            {session.time_taken ? formatDuration(session.time_taken) : '—'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {session.finished_at ? formatDate(session.finished_at) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
