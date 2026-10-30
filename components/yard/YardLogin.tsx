'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Emp { id: string; name: string }

interface Props {
  /** Shown as a switch-employee overlay (with a cancel button) instead of the full login screen */
  onCancel?: () => void
  currentName?: string | null
}

/** Terminal login: pick your name from the employees list, type your PIN. */
export default function YardLogin({ onCancel, currentName }: Props) {
  const router = useRouter()
  const [emps, setEmps] = useState<Emp[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<Emp | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/yard-auth/employees')
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'שגיאה'); return r.json() })
      .then(setEmps)
      .catch(e => setLoadErr((e as Error).message))
  }, [])

  useEffect(() => { if (picked) pinRef.current?.focus() }, [picked])

  async function submit() {
    if (!picked || busy) return
    if (!/^\d{4,8}$/.test(pin)) { setErr('הקוד הוא 4–8 ספרות'); return }
    setBusy(true); setErr(null)
    const r = await fetch('/api/yard-auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: picked.id, pin }),
    })
    if (!r.ok) {
      setErr((await r.json().catch(() => null))?.error ?? 'שגיאה בכניסה')
      setPin(''); setBusy(false); pinRef.current?.focus()
      return
    }
    onCancel?.()
    router.refresh()
  }

  async function logout() {
    setBusy(true)
    await fetch('/api/yard-auth/logout', { method: 'POST' }).catch(() => {})
    onCancel?.()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: '#141A2E', direction: 'rtl', padding: 16 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col" style={{ maxWidth: 520, maxHeight: '100%', padding: 20 }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-slate-900" style={{ fontSize: 22 }}>
            {picked ? `שלום ${picked.name}` : onCancel ? '🔄 החלפת עובד' : '🔧 מסוף רחבה'}
          </h1>
          {onCancel && (
            <button onClick={onCancel} className="text-slate-500 font-black" style={{ fontSize: 22, width: 44, height: 44 }} aria-label="סגור">✕</button>
          )}
        </div>
        <p className="text-slate-500 mb-4" style={{ fontSize: 14 }}>
          {picked ? 'הקלד את הקוד שלך' : currentName ? `מחובר כעת: ${currentName} · בחר עובד` : 'בחר את השם שלך'}
        </p>
        {/* Sessions don't expire on their own any more — this is how an employee signs out */}
        {onCancel && currentName && !picked && (
          <button onClick={logout} disabled={busy}
            className="self-start bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold mb-3 disabled:opacity-60"
            style={{ padding: '8px 14px', fontSize: 14 }}>
            🚪 יציאה ({currentName})
          </button>
        )}

        {!picked ? (
          <div className="overflow-y-auto" style={{ minHeight: 0 }}>
            {loadErr && <div className="text-red-600 font-bold">{loadErr}</div>}
            {!emps && !loadErr && <div className="text-slate-400">טוען...</div>}
            {emps?.length === 0 && (
              <div className="text-slate-500" style={{ fontSize: 14 }}>
                אין עובדים עם קוד כניסה. המנהל מגדיר קוד לכל עובד במסך <b>עובדים</b> במשרד.
              </div>
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {emps?.map(e => (
                <button key={e.id} onClick={() => { setPicked(e); setPin(''); setErr(null) }}
                  className="bg-slate-100 active:bg-slate-200 rounded-xl font-bold text-slate-800"
                  style={{ padding: '18px 10px', fontSize: 18, minHeight: 64 }}>
                  👤 {e.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={ev => { ev.preventDefault(); submit() }} className="flex flex-col gap-3">
            <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off" maxLength={8}
              value={pin} onChange={ev => { setPin(ev.target.value.replace(/\D/g, '')); setErr(null) }}
              aria-label="קוד" placeholder="••••"
              className="border-2 border-slate-300 focus:border-blue-600 rounded-xl text-center font-black outline-none"
              style={{ fontSize: 32, letterSpacing: 12, padding: '12px' }} />
            {err && <div className="text-red-600 font-bold text-center">{err}</div>}
            <button type="submit" disabled={busy || pin.length < 4}
              className="bg-green-700 text-white font-black rounded-xl disabled:opacity-40"
              style={{ padding: 16, fontSize: 19 }}>
              {busy ? '⏳' : 'כניסה'}
            </button>
            <button type="button" onClick={() => { setPicked(null); setPin(''); setErr(null) }}
              className="text-slate-500 font-bold" style={{ padding: 8, fontSize: 15 }}>
              → זה לא אני, חזרה לרשימה
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
