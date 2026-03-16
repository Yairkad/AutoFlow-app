'use client'

import { useState } from 'react'

type JobStatus = 'waiting' | 'in_progress' | 'done' | 'delivered'

interface TrackJob {
  plate: string
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  customer_name: string
  customer_phone: string | null
  job_type: string
  status: JobStatus
  updated_at: string
}

const STEPS: { key: JobStatus; label: string; icon: string }[] = [
  { key: 'waiting',     label: 'ממתין לטיפול', icon: '⏳' },
  { key: 'in_progress', label: 'בטיפול',       icon: '🔧' },
  { key: 'done',        label: 'הטיפול הושלם', icon: '✅' },
  { key: 'delivered',   label: 'הרכב נמסר',    icon: '🚗' },
]

const STATUS_INDEX: Record<JobStatus, number> = {
  waiting: 0, in_progress: 1, done: 2, delivered: 3,
}

function normPlate(s: string) {
  return s.replace(/[-\s]/g, '').toLowerCase()
}

function normPhone(s: string) {
  return s.replace(/\D/g, '').slice(-4)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

// ── Verify Screen ──────────────────────────────────────────────────────────────

function VerifyScreen({ onVerify }: { onVerify: (plate: string, phone: string) => boolean }) {
  const [plate, setPlate]   = useState('')
  const [phone, setPhone]   = useState('')
  const [error, setError]   = useState(false)
  const [shake, setShake]   = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const ok = onVerify(plate, phone)
    if (!ok) {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div
        className="bg-white rounded-3xl shadow-xl max-w-sm w-full overflow-hidden"
        style={{ animation: shake ? 'shake 0.4s ease' : undefined }}
      >
        <style>{`
          @keyframes shake {
            0%,100% { transform: translateX(0); }
            20%,60%  { transform: translateX(-8px); }
            40%,80%  { transform: translateX(8px); }
          }
        `}</style>

        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-600 px-6 py-5 text-white text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">מעקב סטטוס רכב</h1>
          <p className="text-sm opacity-80 mt-1">הזן פרטים לאימות זהות</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">מספר לוחית רישוי</label>
            <input
              value={plate}
              onChange={e => { setPlate(e.target.value); setError(false) }}
              className="w-full border-2 rounded-xl px-4 py-3 text-center text-xl font-bold font-mono tracking-widest focus:outline-none focus:border-blue-500"
              placeholder="12-345-67"
              dir="ltr"
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              4 ספרות אחרונות של הטלפון
            </label>
            <input
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(false) }}
              className="w-full border-2 rounded-xl px-4 py-3 text-center text-xl font-bold font-mono tracking-widest focus:outline-none focus:border-blue-500"
              placeholder="1234"
              dir="ltr"
              inputMode="numeric"
              maxLength={4}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold rounded-xl px-4 py-2 text-center">
              הפרטים שהוזנו אינם תואמים. בדוק ונסה שוב.
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-base transition-colors"
          >
            כניסה לסטטוס ←
          </button>
        </form>

        <div className="bg-gray-50 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">אוטוליין – מערכת ניהול מוסך</p>
        </div>
      </div>
    </div>
  )
}

// ── Status Screen ──────────────────────────────────────────────────────────────

function StatusScreen({ job }: { job: TrackJob }) {
  const currentIdx = STATUS_INDEX[job.status]
  const carInfo = [job.make, job.model, job.year].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <div className="text-xs opacity-75 mb-1 font-semibold tracking-wide">מעקב רכב</div>
          <div className="text-3xl font-black font-mono tracking-widest">{job.plate}</div>
          {carInfo && <div className="text-sm opacity-90 mt-1">{carInfo}</div>}
          {job.color && <div className="text-xs opacity-70 mt-0.5">{job.color}</div>}
        </div>

        {/* Customer + job type */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-400 font-semibold">לקוח</div>
              <div className="font-bold text-gray-800">{job.customer_name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-semibold">סוג עבודה</div>
              <div className="font-bold text-gray-800">{job.job_type}</div>
            </div>
          </div>
        </div>

        {/* Status Stepper */}
        <div className="px-6 py-5">
          <div className="text-xs text-gray-400 font-semibold mb-4 uppercase tracking-wide">סטטוס עבודה</div>
          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const isDone    = idx < currentIdx
              const isCurrent = idx === currentIdx
              const isFuture  = idx > currentIdx

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 font-bold transition-all"
                    style={{
                      background: isDone    ? '#d1fae5'
                                : isCurrent ? '#dbeafe'
                                : '#f3f4f6',
                      border: isCurrent ? '2px solid #3b82f6' : '2px solid transparent',
                      color: isDone ? '#065f46' : isCurrent ? '#1e40af' : '#9ca3af',
                    }}
                  >
                    {isDone ? '✓' : step.icon}
                  </div>

                  <div className="flex-1">
                    <div
                      className="font-semibold text-sm"
                      style={{
                        color: isDone    ? '#059669'
                             : isCurrent ? '#1d4ed8'
                             : '#9ca3af',
                      }}
                    >
                      {step.label}
                    </div>
                    {isCurrent && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        עודכן: {formatDate(job.updated_at)}
                      </div>
                    )}
                  </div>

                  {isCurrent && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">אוטוליין – מערכת ניהול מוסך</p>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function TrackView({ job }: { job: TrackJob }) {
  const [verified, setVerified] = useState(false)

  const handleVerify = (inputPlate: string, inputPhone: string): boolean => {
    const plateMatch = normPlate(inputPlate) === normPlate(job.plate)
    const phoneMatch = job.customer_phone
      ? normPhone(inputPhone) === normPhone(job.customer_phone)
      : inputPhone.length >= 4 // if no phone stored — accept any 4 digits

    if (plateMatch && phoneMatch) {
      setVerified(true)
      return true
    }
    return false
  }

  if (!verified) return <VerifyScreen onVerify={handleVerify} />
  return <StatusScreen job={job} />
}
