'use client'

import { useState, useRef, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════
//  ImportQuestionsModal
//  يدعم استيراد الأسئلة من ملفات CSV أو JSON
//
//  الاستخدام:
//  <ImportQuestionsModal
//    examId="your-exam-id"
//    onImported={(questions) => { /* أعد تحميل الأسئلة */ }}
//    onClose={() => setShowImport(false)}
//  />
//
//  ─── صيغة CSV المطلوبة ────────────────────────────────────────────
//  question,option_a,option_b,option_c,option_d,correct,points
//  "ما نوع رسومات Illustrator؟","نقطية","متجهية","ثلاثية الأبعاد","GIF",B,2
//  "ما امتداد ملف Illustrator؟",".psd",".ai",".eps",".svg",B,2
//
//  correct = A أو B أو C أو D (حرف الإجابة الصحيحة)
//  points  = عدد اختياري (افتراضي 2)
//
//  ─── صيغة JSON المطلوبة ───────────────────────────────────────────
//  [
//    {
//      "question": "ما نوع رسومات Illustrator؟",
//      "options": ["نقطية", "متجهية", "ثلاثية الأبعاد", "GIF"],
//      "correct": 1,        ← رقم الفهرس (0=أولى، 1=ثانية...)
//      "points": 2          ← اختياري
//    }
//  ]
// ═══════════════════════════════════════════════════════════════════

type ParsedQuestion = {
  question_text: string
  options: string[]
  correct_index: number
  points: number
}

type ImportQuestionsModalProps = {
  examId: string
  onImported: (count: number) => void
  onClose: () => void
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportQuestionsModal({ examId, onImported, onClose }: ImportQuestionsModalProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [parsed, setParsed] = useState<ParsedQuestion[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── CSV Parser ────────────────────────────────────────────────────
  const parseCSV = (text: string): { questions: ParsedQuestion[]; errors: string[]; warnings: string[] } => {
    const errs: string[] = []
    const warns: string[] = []
    const questions: ParsedQuestion[] = []

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      errs.push('الملف فارغ أو يحتوي على سطر رأس فقط')
      return { questions, errors: errs, warnings: warns }
    }

    // Parse header
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
    const qIdx = header.findIndex(h => h.includes('question') || h === 'سؤال' || h === 'q')
    const aIdx = header.findIndex(h => h === 'option_a' || h === 'a' || h === 'خيار_أ' || h === 'option a')
    const bIdx = header.findIndex(h => h === 'option_b' || h === 'b' || h === 'خيار_ب' || h === 'option b')
    const cIdx = header.findIndex(h => h === 'option_c' || h === 'c' || h === 'خيار_ج' || h === 'option c')
    const dIdx = header.findIndex(h => h === 'option_d' || h === 'd' || h === 'خيار_د' || h === 'option d')
    const correctIdx = header.findIndex(h => h.includes('correct') || h === 'الصحيحة' || h === 'answer')
    const pointsIdx = header.findIndex(h => h.includes('point') || h === 'علامة' || h === 'درجة')

    if (qIdx === -1) { errs.push('لم يتم العثور على عمود السؤال. تأكد من وجود عمود باسم "question"'); return { questions, errors: errs, warnings: warns } }
    if (correctIdx === -1) { errs.push('لم يتم العثور على عمود الإجابة الصحيحة. تأكد من وجود عمود باسم "correct"'); return { questions, errors: errs, warnings: warns } }

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i])
      const lineNum = i + 1

      const questionText = row[qIdx]?.trim()
      if (!questionText) { warns.push(`السطر ${lineNum}: سؤال فارغ — تم التجاهل`); continue }

      const options: string[] = []
      if (aIdx !== -1 && row[aIdx]?.trim()) options.push(row[aIdx].trim())
      if (bIdx !== -1 && row[bIdx]?.trim()) options.push(row[bIdx].trim())
      if (cIdx !== -1 && row[cIdx]?.trim()) options.push(row[cIdx].trim())
      if (dIdx !== -1 && row[dIdx]?.trim()) options.push(row[dIdx].trim())

      // Try auto-detect options if headers are generic
      if (options.length === 0) {
        for (let col = 1; col < Math.min(row.length - 1, 6); col++) {
          if (col !== correctIdx && col !== pointsIdx && row[col]?.trim()) {
            options.push(row[col].trim())
          }
        }
      }

      if (options.length < 2) { warns.push(`السطر ${lineNum}: أقل من خيارين — تم التجاهل`); continue }

      const correctRaw = row[correctIdx]?.trim().toUpperCase()
      const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, 'أ': 0, 'ب': 1, 'ج': 2, 'د': 3 }
      let correctIndex = letterMap[correctRaw] ?? parseInt(correctRaw) - 1

      if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        warns.push(`السطر ${lineNum}: إجابة صحيحة غير صالحة "${correctRaw}" — سيتم اختيار A`)
        correctIndex = 0
      }

      const points = pointsIdx !== -1 ? (parseInt(row[pointsIdx]) || 2) : 2

      questions.push({ question_text: questionText, options, correct_index: correctIndex, points })
    }

    return { questions, errors: errs, warnings: warns }
  }

  // ── JSON Parser ────────────────────────────────────────────────────
  const parseJSON = (text: string): { questions: ParsedQuestion[]; errors: string[]; warnings: string[] } => {
    const errs: string[] = []
    const warns: string[] = []
    const questions: ParsedQuestion[] = []

    let data: unknown
    try { data = JSON.parse(text) } catch { errs.push('الملف ليس JSON صالحاً'); return { questions, errors: errs, warnings: warns } }

    const arr = Array.isArray(data) ? data : (data as Record<string, unknown>).questions
    if (!Array.isArray(arr)) { errs.push('يجب أن يكون الملف مصفوفة JSON أو كائناً يحتوي على مفتاح "questions"'); return { questions, errors: errs, warnings: warns } }

    arr.forEach((item: unknown, idx: number) => {
      const i = idx + 1
      const obj = item as Record<string, unknown>

      const questionText = (obj.question || obj.question_text || obj.q || obj.سؤال || '') as string
      if (!questionText?.trim()) { warns.push(`العنصر ${i}: سؤال فارغ — تم التجاهل`); return }

      let options: string[] = []
      if (Array.isArray(obj.options)) options = (obj.options as unknown[]).map(String)
      else if (Array.isArray(obj.answers)) options = (obj.answers as unknown[]).map((a) => typeof a === 'object' ? String((a as Record<string,unknown>).text || a) : String(a))
      else if (obj.a && obj.b) options = [obj.a, obj.b, obj.c, obj.d].filter(Boolean).map(String)

      if (options.length < 2) { warns.push(`العنصر ${i}: أقل من خيارين — تم التجاهل`); return }

      let correctIndex = 0
      const c = obj.correct ?? obj.correct_index ?? obj.answer ?? obj.الصحيحة
      if (typeof c === 'number') correctIndex = c
      else if (typeof c === 'string') {
        const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, 'أ': 0, 'ب': 1, 'ج': 2, 'د': 3 }
        correctIndex = letterMap[c.toUpperCase()] ?? (parseInt(c) - 1)
      }
      if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) correctIndex = 0

      const points = typeof obj.points === 'number' ? obj.points : typeof obj.درجة === 'number' ? obj.درجة : 2

      questions.push({ question_text: questionText.trim(), options: options.map(o => o.trim()), correct_index: correctIndex, points })
    })

    return { questions, errors: errs, warnings: warns }
  }

  // ── CSV line parser (handles quoted fields) ────────────────────────
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
      else cur += ch
    }
    result.push(cur)
    return result
  }

  // ── Handle File ────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'json'].includes(ext || '')) {
      setErrors(['الملف يجب أن يكون بامتداد .csv أو .json'])
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = ext === 'csv' ? parseCSV(text) : parseJSON(text)
      setParsed(result.questions)
      setErrors(result.errors)
      setWarnings(result.warnings)
      if (result.questions.length > 0) setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  // ── Import to Supabase ─────────────────────────────────────────────
  const importToSupabase = async () => {
    setStep('importing')
    setImportProgress(0)

    // Dynamic import of supabase to avoid requiring it at module level
    const { supabase } = await import('@/lib/supabase')

    let inserted = 0
    const batchSize = 5

    for (let i = 0; i < parsed.length; i += batchSize) {
      const batch = parsed.slice(i, i + batchSize)

      for (let j = 0; j < batch.length; j++) {
        const q = batch[j]
        const globalIdx = i + j

        // Insert question
        const { data: qData, error: qErr } = await supabase
          .from('questions')
          .insert({
            exam_id: examId,
            question_text: q.question_text,
            points: q.points,
            order_index: globalIdx
          })
          .select()
          .single()

        if (qErr || !qData) { console.error('Q insert error:', qErr); continue }

        // Insert answers
        const answers = q.options.map((opt, ai) => ({
          question_id: qData.id,
          answer_text: opt,
          is_correct: ai === q.correct_index,
          order_index: ai
        }))

        await supabase.from('answers').insert(answers)
        inserted++
        setImportProgress(Math.round((globalIdx + 1) / parsed.length * 100))
      }
    }

    setImportedCount(inserted)
    setStep('done')
    onImported(inserted)
  }

  // ── Download Templates ─────────────────────────────────────────────
  const downloadCSVTemplate = () => {
    const content = `question,option_a,option_b,option_c,option_d,correct,points
"ما نوع رسومات Illustrator؟","رسومات نقطية","رسومات متجهية","رسومات ثلاثية الأبعاد","رسومات GIF",B,2
"ما امتداد ملف Illustrator الافتراضي؟",".psd",".ai",".eps",".svg",B,2
"ما اختصار أداة التحديد؟","A","V","S","P",B,2`
    downloadFile('template.csv', content, 'text/csv;charset=utf-8')
  }

  const downloadJSONTemplate = () => {
    const content = JSON.stringify([
      { question: "ما نوع رسومات Illustrator؟", options: ["رسومات نقطية", "رسومات متجهية", "رسومات ثلاثية الأبعاد", "رسومات GIF"], correct: 1, points: 2 },
      { question: "ما امتداد ملف Illustrator الافتراضي؟", options: [".psd", ".ai", ".eps", ".svg"], correct: 1, points: 2 },
      { question: "ما اختصار أداة التحديد؟", options: ["A", "V", "S", "P"], correct: 1, points: 2 }
    ], null, 2)
    downloadFile('template.json', content, 'application/json')
  }

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob(['\uFEFF' + content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  const letters = ['أ', 'ب', 'ج', 'د', 'هـ']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', backdropFilter: 'blur(4px)'
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div style={{
        background: 'white', borderRadius: 20,
        width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
        animation: 'modalIn 0.25s ease'
      }}>

        {/* Header */}
        <div style={{
          padding: '1.5rem 1.5rem 1.25rem',
          borderBottom: '1px solid #F1F0EC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'white', zIndex: 1,
          borderRadius: '20px 20px 0 0'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>📥 استيراد الأسئلة</h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#7a7268' }}>من ملف CSV أو JSON</p>
          </div>
          <button onClick={onClose} style={{ background: '#F5F3EF', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ padding: '1.5rem' }}>

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div>
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#e8500a' : '#E4DFD6'}`,
                  borderRadius: 16,
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? '#FFF3EE' : '#FAFAF8',
                  transition: 'all 0.2s',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>{dragOver ? '📂' : '📁'}</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.4rem' }}>
                  {dragOver ? 'أفلت الملف هنا' : 'اسحب الملف أو اضغط للاختيار'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#7a7268' }}>يدعم ملفات .csv و .json</div>
                <input ref={fileRef} type="file" accept=".csv,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                  {errors.map((err, i) => (
                    <div key={i} style={{ fontSize: '0.85rem', color: '#DC2626', display: 'flex', gap: '0.5rem' }}>
                      <span>⚠️</span><span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Templates */}
              <div style={{ background: '#F5F3EF', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#7a7268', marginBottom: '0.75rem' }}>📄 قوالب جاهزة للتحميل</div>
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button onClick={downloadCSVTemplate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid #E4DFD6', background: 'white', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 500, color: '#1c1916', fontFamily: 'inherit' }}>
                    <span>📊</span> قالب CSV
                  </button>
                  <button onClick={downloadJSONTemplate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid #E4DFD6', background: 'white', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 500, color: '#1c1916', fontFamily: 'inherit' }}>
                    <span>🗂️</span> قالب JSON
                  </button>
                </div>

                {/* Format hints */}
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ background: 'white', borderRadius: 8, padding: '0.75rem', fontSize: '0.78rem' }}>
                    <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: '0.35rem' }}>📊 صيغة CSV</div>
                    <code style={{ fontSize: '0.72rem', color: '#4a4860', whiteSpace: 'pre-wrap', lineHeight: 1.6, display: 'block' }}>{`question,option_a,option_b,
option_c,option_d,correct,points
"السؤال...","خ1","خ2","خ3","خ4",B,2`}</code>
                    <div style={{ marginTop: '0.4rem', color: '#7a7268', fontSize: '0.72rem' }}>correct = A أو B أو C أو D</div>
                  </div>
                  <div style={{ background: 'white', borderRadius: 8, padding: '0.75rem', fontSize: '0.78rem' }}>
                    <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: '0.35rem' }}>🗂️ صيغة JSON</div>
                    <code style={{ fontSize: '0.72rem', color: '#4a4860', whiteSpace: 'pre-wrap', lineHeight: 1.6, display: 'block' }}>{`[{
  "question": "السؤال",
  "options": ["خ1","خ2","خ3","خ4"],
  "correct": 1,
  "points": 2
}]`}</code>
                    <div style={{ marginTop: '0.4rem', color: '#7a7268', fontSize: '0.72rem' }}>correct = رقم الفهرس (0 = أول خيار)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <div>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '0.5rem 0.9rem', fontSize: '0.83rem', fontWeight: 600, color: '#16a34a' }}>
                  ✓ {parsed.length} سؤال جاهز
                </div>
                {warnings.length > 0 && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '0.5rem 0.9rem', fontSize: '0.83rem', fontWeight: 600, color: '#92400E' }}>
                    ⚠️ {warnings.length} تحذير
                  </div>
                )}
                <div style={{ fontSize: '0.82rem', color: '#7a7268', marginRight: 'auto' }}>{fileName}</div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400E', marginBottom: '0.4rem' }}>تحذيرات (لن تؤثر على الاستيراد):</div>
                  {warnings.map((w, i) => <div key={i} style={{ fontSize: '0.8rem', color: '#78350F' }}>• {w}</div>)}
                </div>
              )}

              {/* Preview list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '45vh', overflowY: 'auto', marginBottom: '1.25rem', paddingLeft: '2px' }}>
                {parsed.map((q, qi) => (
                  <div key={qi} style={{ background: '#FAFAF8', border: '1px solid #E4DFD6', borderRadius: 10, padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.65rem' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: '#E8500A', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>{qi + 1}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.5, flex: 1 }}>{q.question_text}</div>
                      <div style={{ fontSize: '0.75rem', background: '#EFF6FF', color: '#2563eb', padding: '2px 8px', borderRadius: 20, flexShrink: 0, fontWeight: 600 }}>{q.points} ن</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.65rem', borderRadius: 7, background: oi === q.correct_index ? '#F0FDF4' : 'white', border: `1px solid ${oi === q.correct_index ? '#86EFAC' : '#E4DFD6'}`, fontSize: '0.8rem', color: oi === q.correct_index ? '#15803d' : '#4a4a4a' }}>
                          <span style={{ fontWeight: 700, flexShrink: 0 }}>{letters[oi]}</span>
                          <span style={{ flex: 1 }}>{opt}</span>
                          {oi === q.correct_index && <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button onClick={() => { setStep('upload'); setParsed([]); setErrors([]); setWarnings([]) }} style={{ flex: 1, padding: '0.85rem', borderRadius: 10, border: '1px solid #E4DFD6', background: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#7a7268', fontFamily: 'inherit' }}>
                  ← رجوع
                </button>
                <button onClick={importToSupabase} style={{ flex: 2, padding: '0.85rem', borderRadius: 10, border: 'none', background: '#E8500A', color: 'white', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(232,80,10,0.28)' }}>
                  استيراد {parsed.length} سؤال →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>جارٍ الاستيراد...</div>
              <div style={{ fontSize: '0.85rem', color: '#7a7268', marginBottom: '1.5rem' }}>{importProgress}% مكتمل</div>
              <div style={{ height: 8, background: '#F1F0EC', borderRadius: 4, overflow: 'hidden', maxWidth: 320, margin: '0 auto' }}>
                <div style={{ height: '100%', width: `${importProgress}%`, background: 'linear-gradient(90deg, #E8500A, #F06928)', borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#b8b2a8', marginTop: '0.75rem' }}>يرجى عدم إغلاق النافذة</div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F0FDF4', border: '2px solid #86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 1.25rem' }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '0.5rem' }}>تم الاستيراد بنجاح!</div>
              <div style={{ fontSize: '0.9rem', color: '#7a7268', marginBottom: '2rem' }}>تم إضافة <strong style={{ color: '#16a34a' }}>{importedCount} سؤال</strong> إلى الامتحان</div>
              <button onClick={onClose} style={{ padding: '0.9rem 2.5rem', borderRadius: 10, border: 'none', background: '#E8500A', color: 'white', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(232,80,10,0.28)' }}>
                رائع، إغلاق
              </button>
            </div>
          )}

        </div>
      </div>

      <style jsx global>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
