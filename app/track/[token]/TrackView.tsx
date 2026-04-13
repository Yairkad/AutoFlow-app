'use client'

import { useState } from 'react'

// ── Alignment types ────────────────────────────────────────────────────────────

type JobStatus = 'waiting' | 'in_progress' | 'done' | 'delivered'

interface AlignmentJob {
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

const ALIGNMENT_STEPS: { key: JobStatus; label: string; icon: string }[] = [
  { key: 'waiting',     label: 'ממתין לטיפול', icon: '⏳' },
  { key: 'in_progress', label: 'בטיפול',       icon: '🔧' },
  { key: 'done',        label: 'הטיפול הושלם', icon: '✅' },
  { key: 'delivered',   label: 'הרכב נמסר',    icon: '🚗' },
]

const ALIGNMENT_STATUS_INDEX: Record<JobStatus, number> = {
  waiting: 0, in_progress: 1, done: 2, delivered: 3,
}

// ── Test transfer types ────────────────────────────────────────────────────────

type TransferStatus = 'ממתין' | 'בדרך' | 'בטסט' | 'עבר' | 'נכשל' | 'הושלם'

interface ExtraCharge {
  description: string
  amount: string
  paid: boolean
}

interface TestTransferJob {
  plate: string
  make: string | null
  model: string | null
  year: number | null
  customer_name: string
  customer_phone: string | null
  transfer_date: string | null
  status: TransferStatus
  extra_charges: ExtraCharge[]
  updated_at: string
}

// Steps: ממתין → בדרך → בטסט → עבר/נכשל → הושלם
// Map נכשל to position 3 (same as עבר) but red
const TRANSFER_STEP_KEYS: TransferStatus[] = ['ממתין', 'בדרך', 'בטסט', 'עבר', 'הושלם']

const TRANSFER_STEP_LABELS: Record<string, { label: string; icon: string }> = {
  'ממתין':  { label: 'ממתין לשינוע',  icon: '⏳' },
  'בדרך':   { label: 'בדרך לטסט',     icon: '🚐' },
  'בטסט':   { label: 'בטסט',           icon: '🔍' },
  'עבר':    { label: 'עבר טסט',        icon: '✅' },
  'הושלם':  { label: 'הושלם ונמסר',   icon: '🏁' },
}

function getTransferStepIndex(status: TransferStatus): number {
  if (status === 'נכשל') return 3  // show at step 3 (like עבר) but red
  return TRANSFER_STEP_KEYS.indexOf(status)
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

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
  const [plate, setPlate] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

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

        <div className="bg-gradient-to-l from-blue-600 to-indigo-600 px-6 py-5 text-white text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">מעקב סטטוס רכב</h1>
          <p className="text-sm opacity-80 mt-1">הזן פרטים לאימות זהות</p>
        </div>

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

// ── Alignment Status Screen ────────────────────────────────────────────────────

function AlignmentStatusScreen({ job }: { job: AlignmentJob }) {
  const currentIdx = ALIGNMENT_STATUS_INDEX[job.status]
  const carInfo = [job.make, job.model, job.year].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full overflow-hidden">

        <div className="bg-gradient-to-l from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <div className="text-xs opacity-75 mb-1 font-semibold tracking-wide">מעקב רכב</div>
          <div className="text-3xl font-black font-mono tracking-widest">{job.plate}</div>
          {carInfo && <div className="text-sm opacity-90 mt-1">{carInfo}</div>}
          {job.color && <div className="text-xs opacity-70 mt-0.5">{job.color}</div>}
        </div>

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

        <div className="px-6 py-5">
          <div className="text-xs text-gray-400 font-semibold mb-4 uppercase tracking-wide">סטטוס עבודה</div>
          <div className="space-y-3">
            {ALIGNMENT_STEPS.map((step, idx) => {
              const isDone    = idx < currentIdx
              const isCurrent = idx === currentIdx
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 font-bold transition-all"
                    style={{
                      background: isDone    ? '#d1fae5' : isCurrent ? '#dbeafe' : '#f3f4f6',
                      border: isCurrent ? '2px solid #3b82f6' : '2px solid transparent',
                      color: isDone ? '#065f46' : isCurrent ? '#1e40af' : '#9ca3af',
                    }}
                  >
                    {isDone ? '✓' : step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{
                      color: isDone ? '#059669' : isCurrent ? '#1d4ed8' : '#9ca3af',
                    }}>
                      {step.label}
                    </div>
                    {isCurrent && (
                      <div className="text-xs text-gray-400 mt-0.5">עודכן: {formatDate(job.updated_at)}</div>
                    )}
                  </div>
                  {isCurrent && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">אוטוליין – מערכת ניהול מוסך</p>
        </div>
      </div>
    </div>
  )
}

// ── Test Transfer Status Screen ────────────────────────────────────────────────

function TestTransferStatusScreen({ job }: { job: TestTransferJob }) {
  const currentIdx = getTransferStepIndex(job.status)
  const failed     = job.status === 'נכשל'
  const carInfo    = [job.make, job.model, job.year].filter(Boolean).join(' ')

  const charges     = Array.isArray(job.extra_charges) ? job.extra_charges : []
  const totalAmt    = charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
  const unpaidAmt   = charges.reduce((s, c) => !c.paid ? s + (parseFloat(c.amount) || 0) : s, 0)

  const headerGrad = failed
    ? 'linear-gradient(to left, #dc2626, #ef4444)'
    : 'linear-gradient(to left, #d97706, #f59e0b)'

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full overflow-hidden">

        {/* Header */}
        <div style={{ background: headerGrad }} className="px-6 py-5 text-white">
          <div className="text-xs opacity-75 mb-1 font-semibold tracking-wide">שינוע לטסט 🚐</div>
          <div className="text-3xl font-black font-mono tracking-widest">{job.plate}</div>
          {carInfo && <div className="text-sm opacity-90 mt-1">{carInfo}</div>}
          {job.transfer_date && (
            <div className="text-xs opacity-80 mt-1">
              📅 תאריך טסט: {new Date(job.transfer_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="text-xs text-gray-400 font-semibold">לקוח</div>
          <div className="font-bold text-gray-800">{job.customer_name}</div>
        </div>

        {/* Stepper */}
        <div className="px-6 py-5">
          <div className="text-xs text-gray-400 font-semibold mb-4 uppercase tracking-wide">סטטוס שינוע</div>

          {/* Failed banner */}
          {failed && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-center">
              <div className="text-2xl mb-1">❌</div>
              <div className="font-bold text-red-700 text-sm">הרכב לא עבר את הטסט</div>
              <div className="text-xs text-red-500 mt-1">יש לתאם תיקונים וטסט חוזר</div>
            </div>
          )}

          <div className="space-y-3">
            {TRANSFER_STEP_KEYS.map((key, idx) => {
              // For נכשל – show step 3 as failed (red) instead of עבר
              const displayKey   = (failed && idx === 3) ? 'נכשל' : key
              const stepInfo     = failed && idx === 3
                ? { label: 'לא עבר טסט', icon: '❌' }
                : TRANSFER_STEP_LABELS[key]

              const isDone    = idx < currentIdx
              const isCurrent = idx === currentIdx
              const isFuture  = idx > currentIdx

              // Color overrides for failed step
              const bg    = failed && isCurrent ? '#fee2e2'
                          : isDone              ? '#d1fae5'
                          : isCurrent           ? '#fef3c7'
                          : '#f3f4f6'
              const border = failed && isCurrent ? '#ef4444'
                           : isCurrent           ? '#f59e0b'
                           : 'transparent'
              const color  = failed && isCurrent ? '#dc2626'
                           : isDone              ? '#065f46'
                           : isCurrent           ? '#92400e'
                           : '#9ca3af'
              const dotColor = failed && isCurrent ? '#ef4444' : '#f59e0b'

              return (
                <div key={displayKey} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 font-bold"
                    style={{ background: bg, border: `2px solid ${border}`, color }}
                  >
                    {isDone ? '✓' : stepInfo.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: isFuture ? '#9ca3af' : color }}>
                      {stepInfo.label}
                    </div>
                    {isCurrent && (
                      <div className="text-xs text-gray-400 mt-0.5">עודכן: {formatDate(job.updated_at)}</div>
                    )}
                  </div>
                  {isCurrent && !failed && (
                    <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: dotColor }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Extra charges */}
        {charges.length > 0 && (
          <div className="px-6 pb-5">
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wide">חיובים נוספים</div>
              <div className="space-y-2">
                {charges.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700 flex-1">{c.description || '—'}</span>
                    <span className="font-bold text-gray-800 whitespace-nowrap">
                      ₪{(parseFloat(c.amount) || 0).toLocaleString()}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {c.paid ? 'שולם' : 'טרם שולם'}
                    </span>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="border-t border-gray-200 mt-3 pt-3 space-y-1">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-500">סה&quot;כ</span>
                  <span className="text-gray-800">₪{totalAmt.toLocaleString()}</span>
                </div>
                {unpaidAmt > 0 && (
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-red-500">יתרה לתשלום</span>
                    <span className="text-red-600">₪{unpaidAmt.toLocaleString()}</span>
                  </div>
                )}
                {unpaidAmt === 0 && totalAmt > 0 && (
                  <div className="text-center text-green-600 text-sm font-bold">✓ שולם במלואו</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-50 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">אוטוליין – מערכת ניהול מוסך</p>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Props =
  | { type: 'alignment';    job: AlignmentJob }
  | { type: 'test_transfer'; job: TestTransferJob }

export default function TrackView(props: Props) {
  const [verified, setVerified] = useState(false)

  const plate = props.job.plate
  const phone = props.job.customer_phone

  const handleVerify = (inputPlate: string, inputPhone: string): boolean => {
    const plateMatch = normPlate(inputPlate) === normPlate(plate)
    const phoneMatch = phone
      ? normPhone(inputPhone) === normPhone(phone)
      : inputPhone.length >= 4
    if (plateMatch && phoneMatch) { setVerified(true); return true }
    return false
  }

  if (!verified) return <VerifyScreen onVerify={handleVerify} />

  if (props.type === 'alignment') return <AlignmentStatusScreen job={props.job} />
  return <TestTransferStatusScreen job={props.job} />
}
