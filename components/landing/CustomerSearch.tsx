'use client'

import { useState } from 'react'

type JobStatus = 'waiting' | 'in_progress' | 'done' | 'delivered'

interface JobResult {
  plate: string
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  job_type: string
  status: JobStatus
  updated_at: string
}

const STEPS: { key: JobStatus; label: string; icon: string }[] = [
  { key: 'waiting',     label: 'ממתין לטיפול', icon: '⏳' },
  { key: 'in_progress', label: 'בטיפול',        icon: '🔧' },
  { key: 'done',        label: 'הטיפול הושלם',  icon: '✅' },
  { key: 'delivered',   label: 'הרכב נמסר',     icon: '🚗' },
]
const STATUS_INDEX: Record<JobStatus, number> = {
  waiting: 0, in_progress: 1, done: 2, delivered: 3,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export default function CustomerSearch() {
  const [plate, setPlate]       = useState('')
  const [phone4, setPhone4]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError]       = useState('')
  const [job, setJob]           = useState<JobResult | null>(null)
  async function doSearch(cleanPlate: string, cleanPhone: string) {
    setLoading(true)
    setNotFound(false)
    setError('')
    try {
      const res  = await fetch('/api/public/customer-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: cleanPlate, phone4: cleanPhone }),
      })
      const data = await res.json()
      if (data.found && data.job) {
        setJob(data.job)
      } else {
        setJob(null)
        setNotFound(true)
      }
    } catch {
      setError('שגיאת חיבור – אנא נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const cleanPlate = plate.trim().toUpperCase()
    const cleanPhone = phone4.trim()
    if (!cleanPlate) { setError('יש להזין מספר לוחית רישוי'); return }
    if (cleanPhone.length !== 4 || !/^\d{4}$/.test(cleanPhone)) {
      setError('יש להזין 4 ספרות אחרונות של מספר הטלפון'); return
    }
    await doSearch(cleanPlate, cleanPhone)
  }

  // ── Result view ──────────────────────────────────────────────────────────
  if (job) {
    const currentIdx = STATUS_INDEX[job.status]
    const carInfo = [job.make, job.model, job.year].filter(Boolean).join(' ')

    return (
      <div dir="rtl">
        {/* Car header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a2a6c, #3b5bdb)',
          borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', color: '#fff',
        }}>
          <div style={{ fontSize: '11px', opacity: .75, fontWeight: 600, letterSpacing: '1px', marginBottom: '4px' }}>מעקב רכב</div>
          <div style={{ fontSize: '26px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '3px' }}>{job.plate}</div>
          {carInfo && <div style={{ fontSize: '13px', opacity: .9, marginTop: '4px' }}>{carInfo}</div>}
          {job.color && <div style={{ fontSize: '12px', opacity: .7, marginTop: '2px' }}>{job.color}</div>}
        </div>

        {/* Job type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '16px', color: '#475569' }}>
          <span style={{ fontWeight: 600 }}>סוג עבודה</span>
          <span style={{ fontWeight: 700, color: '#1a2a6c' }}>{job.job_type}</span>
        </div>

        {/* Stepper */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>
          סטטוס עבודה
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {STEPS.map((step, idx) => {
            const isDone    = idx < currentIdx
            const isCurrent = idx === currentIdx
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700,
                  background: isDone ? '#d1fae5' : isCurrent ? '#dbeafe' : '#f3f4f6',
                  border: isCurrent ? '2px solid #3b82f6' : '2px solid transparent',
                  color: isDone ? '#065f46' : isCurrent ? '#1e40af' : '#9ca3af',
                }}>
                  {isDone ? '✓' : step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 600,
                    color: isDone ? '#059669' : isCurrent ? '#1d4ed8' : '#9ca3af',
                  }}>
                    {step.label}
                  </div>
                  {isCurrent && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      עודכן: {formatDate(job.updated_at)}
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', background: '#3b82f6',
                    animation: 'pulse 1.5s infinite',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Refresh + Search again */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => doSearch(plate.trim().toUpperCase(), phone4.trim())}
            disabled={loading}
            style={{
              flex: 1, background: '#1a2a6c', color: '#fff', border: 'none',
              borderRadius: '10px', padding: '10px', fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600,
              opacity: loading ? .7 : 1,
            }}
          >
            {loading ? 'מרענן...' : '🔄 בדוק סטטוס שוב'}
          </button>
          <button
            onClick={() => { setJob(null); setPlate(''); setPhone4('') }}
            style={{
              flex: 1, background: 'transparent', border: '1.5px solid #e2e8f0',
              borderRadius: '10px', padding: '10px', fontSize: '13px',
              color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            חיפוש חדש
          </button>
        </div>
      </div>
    )
  }

  // ── Search form ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSearch} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a2a6c', marginBottom: '6px' }}>
            לוחית רישוי
          </label>
          <input
            type="text"
            value={plate}
            onChange={e => { setPlate(e.target.value); setNotFound(false); setError('') }}
            placeholder="לדוגמה: 12-345-67"
            maxLength={10}
            style={inputSt}
            aria-label="לוחית רישוי"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a2a6c', marginBottom: '6px' }}>
            4 ספרות אחרונות של הטלפון
          </label>
          <input
            type="tel"
            value={phone4}
            onChange={e => { setPhone4(e.target.value.replace(/\D/g, '').slice(0, 4)); setNotFound(false); setError('') }}
            placeholder="לדוגמה: 5678"
            maxLength={4}
            style={inputSt}
            aria-label="4 ספרות אחרונות של הטלפון"
          />
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }} role="alert">{error}</p>
        )}

        {notFound && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px',
            padding: '12px 16px', fontSize: '14px', color: '#0369a1', lineHeight: 1.6,
          }} role="status">
            אין רכב בטיפול כרגע – מוזמנים להגיע ולקבל את השירות הטוב ביותר!
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#94a3b8' : '#1a2a6c',
            color: '#fff', border: 'none', borderRadius: '10px',
            padding: '13px 24px', fontSize: '15px', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s', fontFamily: 'inherit',
          }}
        >
          {loading ? 'מחפש...' : 'חפש את הרכב שלי'}
        </button>
      </div>
    </form>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  border: '1.5px solid #e2e8f0', borderRadius: '10px',
  fontSize: '15px', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', direction: 'rtl',
}
