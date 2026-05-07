'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, Exam, ExamSession } from '@/lib/supabase'

const COLORS = [
  '#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6',
  '#8B5CF6','#EF4444','#14B8A6','#F97316','#06B6D4',
]

function initials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)
}

function formatTime(seconds: number | null) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Filter = 'all' | 'pass' | 'fail'

export default function ResultsPage() {
  const { examId } = useParams()
  const [exam, setExam] = useState<Exam | null>(null)
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [prevCount, setPrevCount] = useState(0)
  const [newEntry, setNewEntry] = useState<string | null>(null)
  const newEntryTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('results-live')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'exam_sessions',
        filter: `exam_id=eq.${examId}`
      }, () => fetchData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'exam_sessions',
        filter: `exam_id=eq.${examId}`
      }, (payload) => {
        if (payload.new?.finished_at && !payload.old?.finished_at) {
          setNewEntry(payload.new.student_name)
          if (newEntryTimer.current) clearTimeout(newEntryTimer.current)
          newEntryTimer.current = setTimeout(() => setNewEntry(null), 4000)
        }
        fetchData()
      })
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
    if (sessionsData) {
      if (sessionsData.length > prevCount) setPrevCount(sessionsData.length)
      setSessions(sessionsData)
    }
    setLoading(false)
  }

  const copyLink = () => {
    const url = `${window.location.origin}/exam/${examId}`
    navigator.clipboard.writeText(url)
    alert('تم نسخ رابط الامتحان!')
  }

  const passed = sessions.filter(s => s.passed).length
  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.percentage, 0) / sessions.length) : 0
  const topScore = sessions.length > 0 ? Math.round(sessions[0].percentage) : 0

  const filtered = filter === 'pass' ? sessions.filter(s => s.passed)
    : filter === 'fail' ? sessions.filter(s => !s.passed) : sessions

  const top3 = sessions.slice(0, 3)
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]]
    : top3.length === 2 ? [top3[1], top3[0]] : top3

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏆</div>
        <div style={{ fontWeight: 600 }}>جار تحميل النتائج...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Live notification toast */}
      {newEntry && (
        <div style={{
          position: 'fixed', top: 80, right: 20, zIndex: 999,
          background: 'var(--success)', color: 'white',
          padding: '0.75rem 1.25rem', borderRadius: 12,
          fontWeight: 600, fontSize: '0.95rem',
          boxShadow: '0 8px 32px rgba(16,185,129,0.4)',
          animation: 'slideInRight 0.4s ease',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          🎉 {newEntry} أنهى الامتحان!
        </div>
      )}

      {/* Header */}
      <header style={{
        background: 'white', borderBottom: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.75rem',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            → رجوع
          </Link>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🏆</span>
              {exam?.title || 'نتائج الامتحان'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--success)',
                display: 'inline-block', position: 'relative'
              }} />
              تحديث مباشر
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={copyLink}>🔗 مشاركة رابط الامتحان</button>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem', marginBottom: '2rem'
        }}>
          {[
            { label: 'إجمالي الطلاب', value: sessions.length, icon: '👥', bg: '#EEF2FF', iconBg: '#C7D2FE', color: '#4338CA' },
            { label: 'الناجحون', value: passed, icon: '✅', bg: '#F0FDF4', iconBg: '#BBF7D0', color: '#15803D' },
            { label: 'الراسبون', value: sessions.length - passed, icon: '📌', bg: '#FFF1F2', iconBg: '#FECDD3', color: '#BE123C' },
            { label: 'متوسط الدرجات', value: `${avgScore}%`, icon: '📊', bg: '#FFFBEB', iconBg: '#FDE68A', color: '#B45309' },
            { label: 'أعلى علامة', value: `${topScore}%`, icon: '🎯', bg: '#F0F9FF', iconBg: '#BAE6FD', color: '#0369A1' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{
              textAlign: 'center', padding: '1.25rem',
              background: stat.bg, border: 'none',
              animation: `fadeIn 0.5s ease ${i * 0.08}s both`
            }}>
              <div style={{
                width: 44, height: 44, background: stat.iconBg,
                borderRadius: 12, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.3rem', margin: '0 auto 0.6rem'
              }}>{stat.icon}</div>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: stat.color, opacity: 0.8, marginTop: 4, fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Podium */}
        {top3.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.75rem 1rem 0', overflow: 'hidden' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)' }}>🥇 منصة التتويج</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              gap: 16, paddingBottom: 0
            }}>
              {podiumOrder.map((s, i) => {
                const globalRank = sessions.indexOf(s)
                const configs = [
                  { height: 110, avatarSize: 68, fontSize: 22, color: '#D97706', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', medal: '🥈', name: '🥈', delay: 0.2 },
                  { height: 150, avatarSize: 82, fontSize: 26, color: '#B45309', bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.6)', medal: '🥇', name: '🥇', delay: 0.05 },
                  { height: 80, avatarSize: 58, fontSize: 18, color: '#9A6041', bg: 'rgba(194,133,90,0.12)', border: 'rgba(194,133,90,0.35)', medal: '🥉', name: '🥉', delay: 0.3 },
                ][i] || { height: 80, avatarSize: 58, fontSize: 18, color: '#9A6041', bg: 'rgba(194,133,90,0.12)', border: 'rgba(194,133,90,0.35)', medal: '🥉', name: '🥉', delay: 0.3 }

                const avatarColor = COLORS[globalRank % COLORS.length]

                return (
                  <div key={s.id} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    flex: 1, maxWidth: 200,
                    animation: `fadeIn 0.6s ease ${configs.delay}s both`
                  }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{configs.medal}</div>
                    <div style={{
                      width: configs.avatarSize, height: configs.avatarSize,
                      borderRadius: '50%', background: avatarColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 900, fontSize: configs.fontSize,
                      boxShadow: globalRank === 0 ? `0 4px 20px ${avatarColor}60` : 'none',
                      border: globalRank === 0 ? `3px solid ${avatarColor}` : 'none'
                    }}>{initials(s.name)}</div>

                    <div style={{
                      fontWeight: 700, fontSize: '0.9rem', marginTop: 8, textAlign: 'center',
                      color: 'var(--text)', maxWidth: 140, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }} title={s.name}>{s.name.split(' ').slice(0, 2).join(' ')}</div>

                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: configs.color, marginTop: 2 }}>
                      {Math.round(s.percentage)}%
                    </div>

                    <div style={{
                      width: '100%', height: configs.height, marginTop: 12,
                      background: configs.bg, border: `1.5px solid ${configs.border}`,
                      borderRadius: '10px 10px 0 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: `podiumRise 0.7s cubic-bezier(0.34,1.56,0.64,1) ${configs.delay + 0.1}s both`,
                      transformOrigin: 'bottom'
                    }}>
                      <span style={{ fontSize: '2rem', fontWeight: 900, color: configs.color, opacity: 0.3 }}>
                        {globalRank + 1}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filter */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `الكل (${sessions.length})` },
            { key: 'pass', label: `الناجحون (${passed})` },
            { key: 'fail', label: `الراسبون (${sessions.length - passed})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as Filter)} style={{
              padding: '0.45rem 1.1rem', borderRadius: 20,
              border: '0.5px solid var(--border)',
              background: filter === f.key ? 'var(--text)' : 'var(--surface-2)',
              color: filter === f.key ? 'white' : 'var(--text-muted)',
              fontFamily: 'Rubik, sans-serif', fontSize: '0.85rem',
              fontWeight: filter === f.key ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.15s'
            }}>{f.label}</button>
          ))}
        </div>

        {/* Leaderboard table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📋 جدول الترتيب
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filtered.length} طالب</div>
          </div>

          {/* Column headers */}
          {filtered.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: '56px 1fr 100px 140px 80px',
              padding: '0.6rem 1.5rem', gap: '0.5rem',
              background: 'var(--surface-2)', fontSize: '0.75rem',
              fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em'
            }}>
              <span style={{ textAlign: 'center' }}>الترتيب</span>
              <span>الطالب</span>
              <span style={{ textAlign: 'center' }}>العلامة</span>
              <span style={{ textAlign: 'center' }}>النسبة</span>
              <span style={{ textAlign: 'center' }}>الحالة</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '1rem' }}>لا توجد نتائج بعد</div>
              <div style={{ fontSize: '0.85rem' }}>شارك رابط الامتحان مع طلابك</div>
              <button className="btn btn-primary" onClick={copyLink} style={{ marginTop: '1.25rem' }}>
                🔗 نسخ الرابط
              </button>
            </div>
          ) : (
            filtered.map((session, idx) => {
              const globalRank = sessions.indexOf(session) + 1
              const pct = Math.round(session.percentage)
              const avatarColor = COLORS[(globalRank - 1) % COLORS.length]
              const isTop3 = globalRank <= 3
              const rowBg = globalRank === 1 ? 'rgba(245,158,11,0.06)' : 'transparent'

              return (
                <div key={session.id} style={{
                  display: 'grid', gridTemplateColumns: '56px 1fr 100px 140px 80px',
                  padding: '1.1rem 1.5rem', gap: '0.5rem',
                  alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  background: rowBg,
                  animation: `rowSlide 0.4s ease ${idx * 0.04}s both`,
                  transition: 'background 0.15s'
                }}>
                  {/* Rank */}
                  <div style={{ textAlign: 'center' }}>
                    {isTop3 ? (
                      <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>
                        {['🥇', '🥈', '🥉'][globalRank - 1]}
                      </span>
                    ) : (
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-muted)' }}>#{globalRank}</span>
                    )}
                  </div>

                  {/* Student */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: avatarColor, color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.9rem', flexShrink: 0
                    }}>{initials(session.student_name)}</div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{
                        fontWeight: isTop3 ? 700 : 500,
                        fontSize: '1rem', color: 'var(--text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{session.student_name}</div>
                      {session.time_taken && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ⏱ {formatTime(session.time_taken)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
                      {session.score}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>من {session.total_points}</div>
                  </div>

                  {/* Percentage + bar */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '1.5rem', fontWeight: 900, lineHeight: 1,
                      color: session.passed ? 'var(--success)' : 'var(--danger)'
                    }}>{pct}%</div>
                    <div style={{
                      height: 5, background: 'var(--border)', borderRadius: 3,
                      marginTop: 5, overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${pct}%`,
                        background: session.passed ? 'var(--success)' : 'var(--danger)',
                        transition: 'width 0.8s ease'
                      }} />
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ textAlign: 'center' }}>
                    <span className={`badge ${session.passed ? 'badge-green' : 'badge-red'}`}
                      style={{ fontSize: '0.78rem', padding: '0.25rem 0.7rem' }}>
                      {session.passed ? '✓ ناجح' : '✗ راسب'}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      <style>{`
        @keyframes rowSlide {
          from { opacity:0; transform:translateX(20px); }
          to { opacity:1; transform:translateX(0); }
        }
        @keyframes podiumRise {
          from { transform:scaleY(0); }
          to { transform:scaleY(1); }
        }
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(40px); }
          to { opacity:1; transform:translateX(0); }
        }
      `}</style>
    </div>
  )
}
