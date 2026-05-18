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

  async function copySku(sku: string, btn: HTMLButtonElement) {
    await navigator.clipboard.writeText(sku).catch(() => {})
    const orig = btn.textContent
    btn.textContent = '✓ הועתק'
    btn.classList.add('bg-green-600', 'border-green-600', 'text-white')
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('bg-green-600', 'border-green-600', 'text-white') }, 2000)
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold">לוח בקרה רחבה</h1>
        <div className="flex items-center gap-2 bg-green-700 text-white px-3 py-1.5 rounded-full text-sm font-semibold">
          <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
          בשידור חי
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b-2 border-slate-200 flex-shrink-0">
        <button
          onClick={() => setTab('pending')}
          className={`px-6 py-4 text-base font-semibold border-b-[3px] -mb-0.5 transition-colors ${tab === 'pending' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          ממתינים לאישור וסגירה
          <span className="mr-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
        </button>
        <button
          onClick={() => setTab('active')}
          className={`px-6 py-4 text-base font-semibold border-b-[3px] -mb-0.5 transition-colors ${tab === 'active' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          בטיפול פעיל ברחבה
          <span className="mr-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{active.length}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Tab: Pending ── */}
        {tab === 'pending' && (
          <div className="space-y-5">
            {pending.length === 0 && (
              <div className="text-center text-slate-400 py-16 text-lg">אין רכבים ממתינים לאישור</div>
            )}
            {pending.map(s => {
              const grouped = groupItems(s.yard_session_items ?? [])
              const total   = sessionTotal(s.yard_session_items ?? [])
              return (
                <div key={s.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${cardBorder(s.opened_at)}`}>
                  {/* Card header */}
                  <div className="px-5 py-4 bg-slate-50 border-b flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-slate-800">{sessionDisplayName(s)}</div>
                      <div className="text-base font-black tracking-widest text-slate-600">{formatPlate(s.plate)}</div>
                    </div>
                    <div className="text-left text-sm text-slate-500 space-y-0.5">
                      <div>קליטה: {fmtTime(s.opened_at)}</div>
                      <div><TimerTag openedAt={s.opened_at} /></div>
                    </div>
                  </div>

                  {/* Items table */}
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b text-xs text-slate-400 font-bold uppercase tracking-wide">
                        <th className="px-5 py-2 text-right">מק״ט</th>
                        <th className="px-4 py-2 text-right">תיאור</th>
                        <th className="px-4 py-2 text-right">כמות</th>
                        <th className="px-4 py-2 text-right">מחיר יח׳</th>
                        <th className="px-4 py-2 text-right">סה״כ</th>
                        <th className="px-4 py-2 text-right">יח׳ ללא מע״מ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((item, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="px-5 py-3">
                            {item.sku ? (
                              <button
                                onClick={e => copySku(item.sku!, e.currentTarget)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 border-[1.5px] border-blue-500 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-500 hover:text-white transition-colors"
                              >
                                <svg viewBox="0 0 14 16" width="11" height="13" fill="currentColor"><rect x="3" y="0" width="9" height="12" rx="1.5" /><rect x="0" y="3" width="9" height="12" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.2" /></svg>
                                {item.sku}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.name}</td>
                          <td className="px-4 py-3 text-sm font-bold">{item.totalQty}</td>
                          <td className="px-4 py-3 text-sm">
                            {item.unit_price.toLocaleString()}₪
                            {item.price_modified && <span className="mr-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded font-bold">שונה</span>}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-800">{item.totalPrice.toLocaleString()}₪</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{noVat(item.unit_price)}₪</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Footer */}
                  <div className="px-5 py-4 border-t-2 border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black">סה״כ: {total.toLocaleString()}₪</div>
                    </div>
                    <button
                      onClick={() => closeSession(s.id)}
                      disabled={closing === s.id}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-6 py-3 text-sm font-bold transition-colors"
                    >
                      {closing === s.id ? '...' : 'סגור כרטיס ✓'}
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
            <div className="grid grid-cols-4 gap-4">
              {active.map(s => {
                const items = s.yard_session_items ?? []
                const total = sessionTotal(items)
                return (
                  <div key={s.id} className={`bg-white rounded-xl border-2 p-4 shadow-sm ${cardBorder(s.opened_at)}`}>
                    <div className="font-bold text-base text-slate-800 mb-0.5">{sessionDisplayName(s)}</div>
                    <div className="font-black text-slate-600 tracking-wider mb-2">{formatPlate(s.plate)}</div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>קליטה: {fmtTime(s.opened_at)}</span>
                      {total > 0 && <span className="font-bold text-blue-600">{total.toLocaleString()}₪</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <TimerTag openedAt={s.opened_at} />
                      {items.length > 0 && (
                        <span className="text-xs text-slate-500 font-medium">{items.length} פריטים</span>
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
