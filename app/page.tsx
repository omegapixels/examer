'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Exam } from '@/lib/supabase'

export default function HomePage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setExams(data)
    setLoading(false)
  }

  const deleteExam = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الامتحان؟')) return
    setDeleting(id)
    await supabase.from('exams').delete().eq('id', id)
    setExams(prev => prev.filter(e => e.id !== id))
    setDeleting(null)
  }

  const toggleActive = async (exam: Exam) => {
    const { data } = await supabase
      .from('exams')
      .update({ is_active: !exam.is_active })
      .eq('id', exam.id)
      .select()
      .single()
    if (data) setExams(prev => prev.map(e => e.id === exam.id ? data : e))
  }

  const copyLink = (examId: string) => {
    const url = `${window.location.origin}/exam/${examId}`
    navigator.clipboard.writeText(url)
    alert('تم نسخ الرابط!')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
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
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40,
            background: 'linear-gradient(135deg, var(--primary), #7C3AED)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem'
          }}>📚</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>نظام الامتحانات</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>لوحة التحكم</div>
          </div>
        </div>
        <Link href="/admin/new" className="btn btn-primary">
          ＋ إنشاء امتحان جديد
        </Link>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {[
            { label: 'إجمالي الامتحانات', value: exams.length, icon: '📋', color: '#DBEAFE' },
            { label: 'الامتحانات النشطة', value: exams.filter(e => e.is_active).length, icon: '✅', color: '#D1FAE5' },
            { label: 'الامتحانات الموقوفة', value: exams.filter(e => !e.is_active).length, icon: '⏸️', color: '#FEF3C7' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
              <div style={{
                width: 48, height: 48,
                background: stat.color,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem',
                margin: '0 auto 0.75rem'
              }}>{stat.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)' }}>{stat.value}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>الامتحانات</h2>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
            </div>
          ) : exams.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>لا توجد امتحانات بعد</div>
              <div style={{ fontSize: '0.85rem' }}>ابدأ بإنشاء امتحانك الأول</div>
            </div>
          ) : (
            <div>
              {exams.map((exam, idx) => (
                <div key={exam.id} style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: idx < exams.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{exam.title}</span>
                      <span className={`badge ${exam.is_active ? 'badge-green' : 'badge-red'}`}>
                        {exam.is_active ? 'نشط' : 'موقوف'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {exam.time_limit && <span>⏱ {exam.time_limit} دقيقة</span>}
                      <span>🎯 النجاح: {exam.pass_score}%</span>
                      <span>📅 {new Date(exam.created_at).toLocaleDateString('ar-SA')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => copyLink(exam.id)}>🔗 الرابط</button>
                    <Link href={`/admin/results/${exam.id}`} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>📊 النتائج</Link>
                    <Link href={`/admin/edit/${exam.id}`} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>✏️ تعديل</Link>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => toggleActive(exam)}>{exam.is_active ? '⏸ إيقاف' : '▶ تفعيل'}</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => deleteExam(exam.id)} disabled={deleting === exam.id}>{deleting === exam.id ? '...' : '🗑'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
