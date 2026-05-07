'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, Exam, ExamSession } from '@/lib/supabase'

export default function ResultsPage() {
  const { examId } = useParams()
  const [exam, setExam] = useState<Exam | null>(null)
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    // Real-time subscription
    const channel = supabase
      .channel('results')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'exam_sessions', filter: `exam_id=eq.${examId}` }, () => fetchData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_sessions', filter: `exam_id=eq.${examId}` }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [examId])

  const fetchData = async () => {
    const { data: examData } = await supabase.from('exams').select('*').eq('id', examId).single()
    const { data: sessionsData } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .not('finished_at', 'is', null)
      .order('percentage', { ascending: false })

    if (examData) setExam(examData)
    if (sessionsData) setSessions(sessionsData)
    setLoading(false)
  }

  const formatTime = (seconds: number | null) => {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  const copyLink = () => {
    const url = `${window.location.origin}/exam/${examId}`
    navigator.clipboard.writeText(url)
    alert('تم نسخ رابط الامتحان!')
  }

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

  const passed = sessions.filter(s => s.passed).length
  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.percentage, 0) / sessions.length)
    : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            → رجوع
          </Link>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>📊 نتائج الامتحان</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{exam?.title}</div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={copyLink}>🔗 مشاركة رابط الامتحان</button>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {[
            { label: 'إجمالي الطلاب', value: sessions.length, icon: '👥', color: '#DBEAFE' },
            { label: 'الناجحون', value: passed, icon: '✅', color: '#D1FAE5' },
            { label: 'الراسبون', value: sessions.length - passed, icon: '❌', color: '#FEE2E2' },
            { label: 'متوسط الدرجات', value: `${avgScore}%`, icon: '📈', color: '#FEF3C7' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
              <div style={{
                width: 44, height: 44, background: stat.color, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', margin: '0 auto 0.75rem'
              }}>{stat.icon}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>{stat.value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>🏆 ترتيب الطلاب</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              يتحدث تلقائياً
            </div>
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>لا توجد نتائج بعد</div>
              <div style={{ fontSize: '0.85rem' }}>شارك رابط الامتحان مع طلابك</div>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 100px 100px 80px 80px',
                padding: '0.75rem 1.5rem',
                background: 'var(--surface-2)',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                gap: '0.5rem'
              }}>
                <span>الترتيب</span>
                <span>اسم الطالب</span>
                <span style={{ textAlign: 'center' }}>النتيجة</span>
                <span style={{ textAlign: 'center' }}>النسبة</span>
                <span style={{ textAlign: 'center' }}>الحالة</span>
                <span style={{ textAlign: 'center' }}>الوقت</span>
              </div>

              {sessions.map((session, idx) => (
                <div key={session.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 100px 100px 80px 80px',
                  padding: '1rem 1.5rem',
                  borderBottom: idx < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: idx === 0 ? '#FFFBEB' : idx === 1 ? '#F8FAFF' : idx === 2 ? '#FFF7F0' : 'white',
                  animation: 'fadeIn 0.4s ease both',
                  animationDelay: `${idx * 0.05}s`
                }}>
                  <span style={{ fontSize: idx < 3 ? '1.4rem' : '0.9rem', fontWeight: 700, textAlign: 'center' }}>
                    {getRankIcon(idx + 1)}
                  </span>
                  <span style={{ fontWeight: idx === 0 ? 700 : 500, fontSize: '0.9rem' }}>{session.student_name}</span>
                  <span style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {session.score}/{session.total_points}
                  </span>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: session.percentage >= (exam?.pass_score || 50) ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {Math.round(session.percentage)}%
                    </span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span className={`badge ${session.passed ? 'badge-green' : 'badge-red'}`}>
                      {session.passed ? 'ناجح' : 'راسب'}
                    </span>
                  </div>
                  <span style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {formatTime(session.time_taken)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
