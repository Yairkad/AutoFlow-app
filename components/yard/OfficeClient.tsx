'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession, YardSessionItem } from '@/lib/yard/types'
import { sessionDisplayName, sessionTotal, minutesSince, formatPlate } from '@/lib/yard/types'

const VAT = 1.18

interface Props {
  initialActive:  YardSession[]
  initialPending: YardSession[]
}

export default function OfficeClient({ initialActive, initialPending }: Props) {
  const router  = useRouter()
  const [tab,     setTab]     = useState<'pending' | 'active'>('pending')
  const [active,  setActive]  = useState(initialActive)
  const [pending, setPending] = useState(initialPending)
  const [closing, setClosing] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const ch = supabase
      .channel('office-yard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_sessions' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_session_items' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line

  async function closeSession(id: string) {
    setClosing(id)
    await fetch(`/api/yard/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    setPending(p => p.filter(s => s.id !== id))
    setClosing(null)
  }

  async function copyText(text: string, btn: HTMLButtonElement) {
    await navigator.clipboard.writeText(text).catch(() => {})
    const orig = btn.textContent
    btn.textContent = '✓'
    btn.classList.add('!bg-green-600', '!border-green-600', '!text-white')
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('!bg-green-600', '!border-green-600', '!text-white') }, 2000)
  }

  function timerState(openedAt: string) {
    const m = minutesSince(openedAt)
    if (m > 45) return 'critical'
    if (m > 30) return 'warn'
    return 'ok'
  }

  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const noVat   = (n: number) => Math.round(n / VAT).toLocaleString()

  // Group items by ref_id+name for office display
  function groupItems(items: YardSessionItem[]) {
    const map = new Map<string, YardSessionItem & { totalQty: number; totalPrice: number }>()
    for (const item of items) {
      const key = item.sku ?? item.name
      if (map.has(key)) {
        const e = map.get(key)!
        e.totalQty   += item.quantity
        e.totalPrice += item.unit_price * item.quantity
      } else {
        map.set(key, { ...item, totalQty: item.quantity, totalPrice: item.unit_price * item.quantity })
      }
    }
    return [...map.values()]
  }

  const TimerTag = ({ openedAt }: { openedAt: string }) => {
    const m = minutesSince(openedAt)
    const st = timerState(openedAt)
    const cls = st === 'critical' ? 'bg-red-600 text-white' : st === 'warn' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>⏱ {m} דק׳</span>
  }

  const cardBorder = (openedAt: string) => {
    const st = timerState(openedAt)
    if (st === 'critical') return 'border-red-500 animate-[flash_1.1s_ease-in-out_infinite]'
    if (st === 'warn')     return 'border-red-400'
    return 'border-slate-200'
  }

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={e => copyText(text, e.currentTarget)}
      className="inline-flex items-center gap-1 border-[1.5px] border-slate-300 text-slate-500 rounded-lg text-xs font-semibold hover:bg-slate-600 hover:border-slate-600 hover:text-white transition-colors"
      style={{ padding: '3px 8px' }}
    >
      <svg viewBox="0 0 14 16" width="10" height="12" fill="currentColor">
        <rect x="3" y="0" width="9" height="12" rx="1.5"/>
        <rect x="0" y="3" width="9" height="12" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {/* Top bar */}
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0" style={{ padding: '14px 20px' }}>
        <h1 className="text-xl font-bold">🖥 לוח בקרה רחבה</h1>
        <div className="flex items-center gap-2 bg-green-700 text-white rounded-full text-sm font-semibold" style={{ padding: '6px 14px' }}>
          <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
          בשידור חי
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b-2 border-slate-200 flex-shrink-0">
        {(['pending', 'active'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="text-base font-semibold transition-colors"
            style={{
              padding: '14px 24px',
              borderBottom: tab === t ? '3px solid #2563eb' : '3px solid transparent',
              color: tab === t ? '#1d4ed8' : '#94a3b8',
              marginBottom: '-2px',
            }}
          >
            {t === 'pending' ? 'ממתינים לאישור וסגירה' : 'בטיפול פעיל ברחבה'}
            <span className="font-bold text-white text-xs rounded-full"
              style={{ marginRight: '8px', padding: '2px 8px', background: t === 'pending' ? '#f59e0b' : '#3b82f6' }}>
              {t === 'pending' ? pending.length : active.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 20px' }}>

        {/* ── Tab: Pending ── */}
        {tab === 'pending' && (
          <div>
            {pending.length === 0 && (
              <div className="text-center text-slate-400 py-16 text-lg">אין רכבים ממתינים לאישור</div>
            )}
            {pending.map(s => {
              const grouped = groupItems(s.yard_session_items ?? [])
              const total   = sessionTotal(s.yard_session_items ?? [])
              return (
                <div key={s.id} className={`bg-white rounded-2xl border-2 overflow-hidden ${cardBorder(s.opened_at)}`}
                  style={{ marginBottom: '16px', boxShadow: '0 1px 6px rgba(0,0,0,.08)' }}>

                  {/* Card header */}
                  <div className="flex items-center justify-between border-b" style={{ padding: '14px 20px', background: '#f8fafc' }}>
                    <div>
                      {(s.make || s.model) && (
                        <div className="font-bold text-slate-700" style={{ fontSize: '16px' }}>
                          {[s.make, s.model].filter(Boolean).join(' ')}
                          {s.year && <span className="text-slate-400 font-normal" style={{ marginRight: '6px' }}>· {s.year}</span>}
                        </div>
                      )}
                      <div className="flex items-center" style={{ gap: '10px', marginTop: '2px' }}>
                        <span className="font-black text-slate-900" style={{ fontSize: '20px', letterSpacing: '2px' }}>
                          {formatPlate(s.plate)}
                        </span>
                        <CopyBtn text={s.plate} label={formatPlate(s.plate)} />
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 text-left" style={{ lineHeight: '1.7' }}>
                      <div>קליטה: {fmtTime(s.opened_at)}</div>
                      <div><TimerTag openedAt={s.opened_at} /></div>
                    </div>
                  </div>

                  {/* Items table */}
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {['מק״ט','תיאור','כמות','מחיר יח׳','סה״כ','יח׳ ללא מע״מ'].map(h => (
                          <th key={h} className="text-right text-slate-400 font-bold uppercase tracking-wide"
                            style={{ padding: '8px 16px', fontSize: '11px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            {item.sku ? (
                              <button
                                onClick={e => copyText(item.sku!, e.currentTarget)}
                                className="inline-flex items-center gap-1.5 border-[1.5px] border-blue-500 text-blue-600 rounded-lg font-semibold hover:bg-blue-500 hover:text-white transition-colors"
                                style={{ padding: '3px 8px', fontSize: '12px' }}
                              >
                                <svg viewBox="0 0 14 16" width="10" height="12" fill="currentColor">
                                  <rect x="3" y="0" width="9" height="12" rx="1.5"/>
                                  <rect x="0" y="3" width="9" height="12" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.2"/>
                                </svg>
                                {item.sku}
                              </button>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="font-medium text-slate-800" style={{ padding: '12px 16px', fontSize: '14px' }}>{item.name}</td>
                          <td className="font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{item.totalQty}</td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            {item.unit_price.toLocaleString()}₪
                            {item.price_modified && (
                              <span className="bg-amber-100 text-amber-700 rounded font-bold" style={{ marginRight: '6px', padding: '2px 6px', fontSize: '11px' }}>שונה</span>
                            )}
                          </td>
                          <td className="font-bold text-slate-800" style={{ padding: '12px 16px', fontSize: '14px' }}>{item.totalPrice.toLocaleString()}₪</td>
                          <td className="text-slate-500" style={{ padding: '12px 16px', fontSize: '14px' }}>{noVat(item.unit_price)}₪</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t-2 border-slate-100" style={{ padding: '14px 20px', background: '#f8fafc' }}>
                    <div className="font-black" style={{ fontSize: '18px' }}>סה״כ: {total.toLocaleString()}₪</div>
                    <button
                      onClick={() => closeSession(s.id)}
                      disabled={closing === s.id}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors"
                      style={{ padding: '10px 24px', fontSize: '14px' }}
                    >
                      {closing === s.id ? '...' : '✓ סגור כרטיס'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tab: Active ── */}
        {tab === 'active' && (
          <div>
            {active.length === 0 && (
              <div className="text-center text-slate-400 py-16 text-lg">אין רכבים פעילים ברחבה כרגע</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {active.map(s => {
                const items = s.yard_session_items ?? []
                const total = sessionTotal(items)
                return (
                  <div key={s.id} className={`bg-white rounded-2xl border-2 ${cardBorder(s.opened_at)}`}
                    style={{ padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
                    {(s.make || s.model) && (
                      <div className="font-bold text-slate-700" style={{ fontSize: '15px', marginBottom: '2px' }}>
                        {[s.make, s.model].filter(Boolean).join(' ')}
                      </div>
                    )}
                    <div className="flex items-center" style={{ gap: '8px', marginBottom: '8px' }}>
                      <span className="font-black text-slate-900" style={{ fontSize: '18px', letterSpacing: '2px' }}>
                        {formatPlate(s.plate)}
                      </span>
                      <CopyBtn text={s.plate} label="העתק" />
                    </div>
                    <div className="flex items-center justify-between text-slate-400" style={{ fontSize: '12px', marginBottom: '6px' }}>
                      <span>קליטה: {fmtTime(s.opened_at)}</span>
                      {total > 0 && <span className="font-bold text-blue-600">{total.toLocaleString()}₪</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <TimerTag openedAt={s.opened_at} />
                      {items.length > 0 && (
                        <span className="text-slate-400 font-medium" style={{ fontSize: '12px' }}>{items.length} פריטים</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
