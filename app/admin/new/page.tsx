'use client'

import Link from 'next/link'
import ExamBuilder from '@/components/ExamBuilder'

export default function NewExamPage() {
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
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>إنشاء امتحان جديد</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>أضف الأسئلة والإجابات</div>
        </div>
      </header>
      <ExamBuilder mode="create" />
    </div>
  )
}
