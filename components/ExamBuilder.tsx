'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Exam, Question, Answer } from '@/lib/supabase'

type AnswerForm = { text: string; is_correct: boolean }
type QuestionForm = { question_text: string; points: number; answers: AnswerForm[] }

interface ExamBuilderProps {
  initialExam?: Exam
  initialQuestions?: (Question & { answers: Answer[] })[]
  mode: 'create' | 'edit'
}

export default function ExamBuilder({ initialExam, initialQuestions, mode }: ExamBuilderProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState(initialExam?.title || '')
  const [description, setDescription] = useState(initialExam?.description || '')
  const [passScore, setPassScore] = useState(initialExam?.pass_score || 50)
  const [timeLimit, setTimeLimit] = useState<number | null>(initialExam?.time_limit || null)
  const [hasTimer, setHasTimer] = useState(!!initialExam?.time_limit)

  const [questions, setQuestions] = useState<QuestionForm[]>(
    initialQuestions?.map(q => ({
      question_text: q.question_text,
      points: q.points,
      answers: q.answers.map(a => ({ text: a.answer_text, is_correct: a.is_correct }))
    })) || []
  )

  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      question_text: '',
      points: 1,
      answers: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ]
    }])
  }

  const removeQuestion = (qi: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== qi))
  }

  const updateQuestion = (qi: number, field: keyof QuestionForm, value: QuestionForm[keyof QuestionForm]) => {
    setQuestions(prev => prev.map((q, i) => i === qi ? { ...q, [field]: value } : q))
  }

  const updateAnswer = (qi: number, ai: number, field: keyof AnswerForm, value: AnswerForm[keyof AnswerForm]) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qi) return q
      const answers = q.answers.map((a, j) => {
        if (j !== ai) {
          // If setting this as correct, unset others
          if (field === 'is_correct' && value === true) return { ...a, is_correct: false }
          return a
        }
        return { ...a, [field]: value }
      })
      return { ...q, answers }
    }))
  }

  const addAnswer = (qi: number) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qi ? { ...q, answers: [...q.answers, { text: '', is_correct: false }] } : q
    ))
  }

  const removeAnswer = (qi: number, ai: number) => {
    setQuestions(prev => prev.map((q, i) =>
      i === qi ? { ...q, answers: q.answers.filter((_, j) => j !== ai) } : q
    ))
  }

  const validate = () => {
    if (!title.trim()) return 'يرجى إدخال عنوان الامتحان'
    if (questions.length === 0) return 'يرجى إضافة سؤال واحد على الأقل'
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question_text.trim()) return `يرجى إدخال نص السؤال ${i + 1}`
      if (q.answers.length < 2) return `السؤال ${i + 1} يجب أن يحتوي على خيارين على الأقل`
      if (!q.answers.some(a => a.is_correct)) return `يرجى تحديد الإجابة الصحيحة للسؤال ${i + 1}`
      if (q.answers.some(a => !a.text.trim())) return `يرجى ملء جميع خيارات السؤال ${i + 1}`
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)

    try {
      let examId = initialExam?.id

      const examData = {
        title: title.trim(),
        description: description.trim() || null,
        pass_score: passScore,
        time_limit: hasTimer ? timeLimit : null,
        updated_at: new Date().toISOString()
      }

      if (mode === 'create') {
        const { data: exam, error: examErr } = await supabase
          .from('exams')
          .insert(examData)
          .select()
          .single()
        if (examErr) throw examErr
        examId = exam.id
      } else {
        await supabase.from('exams').update(examData).eq('id', examId)
        // Delete old questions
        await supabase.from('questions').delete().eq('exam_id', examId)
      }

      // Insert questions and answers
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        const { data: qData, error: qErr } = await supabase
          .from('questions')
          .insert({
            exam_id: examId,
            question_text: q.question_text,
            points: q.points,
            order_index: i
          })
          .select()
          .single()
        if (qErr) throw qErr

        // Shuffle answers before saving to avoid always-first-is-correct pattern
        const shuffledAnswers = [...q.answers].sort(() => Math.random() - 0.5)
        
        await supabase.from('answers').insert(
          shuffledAnswers.map(a => ({
            question_id: qData.id,
            answer_text: a.text,
            is_correct: a.is_correct
          }))
        )
      }

      router.push('/')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ أثناء الحفظ'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Exam Info */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📋</span> معلومات الامتحان
        </h2>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label className="label">عنوان الامتحان *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: امتحان الرياضيات - الفصل الأول" />
          </div>
          <div>
            <label className="label">وصف الامتحان (اختياري)</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف مختصر للامتحان..." rows={2} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="label">نسبة النجاح (%)</label>
              <input className="input" type="number" min={1} max={100} value={passScore} onChange={e => setPassScore(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">توقيت الامتحان</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={hasTimer} onChange={e => setHasTimer(e.target.checked)} style={{ width: 16, height: 16 }} />
                  تحديد وقت
                </label>
                {hasTimer && (
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={timeLimit || ''}
                    onChange={e => setTimeLimit(Number(e.target.value))}
                    placeholder="دقيقة"
                    style={{ maxWidth: 100 }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {questions.map((q, qi) => (
          <div key={qi} className="card" style={{ borderRight: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 28, height: 28,
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700
                }}>{qi + 1}</div>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>السؤال {qi + 1}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label className="label" style={{ margin: 0, fontSize: '0.8rem' }}>العلامة:</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={e => updateQuestion(qi, 'points', Number(e.target.value))}
                    style={{ width: 70, textAlign: 'center' }}
                  />
                </div>
                <button className="btn btn-danger" style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => removeQuestion(qi)}>حذف</button>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">نص السؤال *</label>
              <textarea
                className="input"
                value={q.question_text}
                onChange={e => updateQuestion(qi, 'question_text', e.target.value)}
                placeholder="اكتب السؤال هنا..."
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div>
              <label className="label" style={{ marginBottom: '0.6rem' }}>
                الإجابات — <span style={{ color: 'var(--success)', fontWeight: 600 }}>حدد الإجابة الصحيحة</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {q.answers.map((a, ai) => (
                  <div key={ai} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem',
                    borderRadius: 8,
                    border: `1.5px solid ${a.is_correct ? 'var(--success)' : 'var(--border)'}`,
                    background: a.is_correct ? '#F0FDF4' : 'var(--surface)',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={a.is_correct}
                      onChange={() => updateAnswer(qi, ai, 'is_correct', true)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--success)', flexShrink: 0 }}
                    />
                    <input
                      className="input"
                      value={a.text}
                      onChange={e => updateAnswer(qi, ai, 'text', e.target.value)}
                      placeholder={`الخيار ${ai + 1}`}
                      style={{ border: 'none', padding: '0', flex: 1, background: 'transparent', boxShadow: 'none' }}
                    />
                    {q.answers.length > 2 && (
                      <button
                        onClick={() => removeAnswer(qi, ai)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '0 0.2rem' }}
                        title="حذف الخيار"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="btn btn-secondary"
                style={{ marginTop: '0.6rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                onClick={() => addAnswer(qi)}
              >+ إضافة خيار</button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: '1.5rem', padding: '0.8rem', fontSize: '0.95rem' }} onClick={addQuestion}>
        + إضافة سؤال جديد
      </button>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => router.push('/')}>إلغاء</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 140, justifyContent: 'center' }}>
          {saving ? '⏳ جار الحفظ...' : mode === 'create' ? '✓ إنشاء الامتحان' : '✓ حفظ التعديلات'}
        </button>
      </div>
    </div>
  )
}
