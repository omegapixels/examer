'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, Exam, Question, Answer } from '@/lib/supabase'
import ExamBuilder from '@/components/ExamBuilder'

export default function EditExamPage() {
  const { examId } = useParams()
  const [exam, setExam] = useState<Exam | null>(null)
  const [questions, setQuestions] = useState<(Question & { answers: Answer[] })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const { data: examData } = await supabase.from('exams').select('*').eq('id', examId).single()
      const { data: qData } = await supabase
        .from('questions')
        .select('*, answers(*)')
        .eq('exam_id', examId)
        .order('order_index')

      if (examData) setExam(examData)
      if (qData) setQuestions(qData)
      setLoading(false)
    }
    fetchData()
  }, [examId])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
          <div>جار التحميل...</div>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <div style={{ fontWeight: 600 }}>الامتحان غير موجود</div>
          <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>العودة للرئيسية</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
      }}>
        <Link href="/" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          → رجوع
        </Link>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>تعديل الامتحان</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{exam.title}</div>
        </div>
      </header>
      <ExamBuilder mode="edit" initialExam={exam} initialQuestions={questions} />
    </div>
  )
}
