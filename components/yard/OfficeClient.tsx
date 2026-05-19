'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession, YardSessionItem, YardService } from '@/lib/yard/types'
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
  const [closing,      setClosing]      = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [priceModal,   setPriceModal]   = useState(false)
  const [services,     setServices]     = useState<YardService[]>([])
  const [editPrices,   setEditPrices]   = useState<Record<string, string>>({})
  const [editNames,    setEditNames]    = useState<Record<string, string>>({})
  const [saving,       setSaving]       = useState<string | null>(null)
  const [newSvc,       setNewSvc]       = useState({ name: '', price: '' })
  const [addingNew,    setAddingNew]    = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Sync local state when server data refreshes via router.refresh()
  useEffect(() => { setActive(initialActive) },   [initialActive])   // eslint-disable-line
  useEffect(() => { setPending(initialPending) },  [initialPending])  // eslint-disable-line

  useEffect(() => {
    const ch = supabase
      .channel('office-yard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_sessions' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_session_items' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line

  const DEFAULT_SERVICES = [
    'תיקון תקר',
    'כיוון פרונט',
    'איזון גלגלים',
    'חיישן TPMS',
    'פירוק והרכבה',
    'כיוון 4 גלגלים',
  ]

  async function openPriceModal() {
    const res  = await fetch('/api/yard/services')
    let data: YardService[] = await res.json()

    // Auto-create any default services that don't exist yet (price = 0)
    const existingNames = new Set(data.map(s => s.name))
    for (const name of DEFAULT_SERVICES) {
      if (!existingNames.has(name)) {
        const r = await fetch('/api/yard/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price: 0 }),
        })
        if (r.ok) data = [...data, await r.json()]
      }
    }

    setServices(data)
    setEditPrices(Object.fromEntries(data.map(s => [s.id, String(s.price)])))
    setEditNames(Object.fromEntries(data.map(s => [s.id, s.name])))
    setPriceModal(true)
  }

  async function saveField(id: string) {
    const price = Number(editPrices[id])
    const name  = (editNames[id] ?? '').trim()
    if (!name || isNaN(price)) return
    setSaving(id)
    await fetch(`/api/yard/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price }),
    })
    setSaving(null)
    setServices(sv => sv.map(s => s.id === id ? { ...s, name, price } : s))
  }

  async function addService() {
    if (!newSvc.name.trim()) return
    setAddingNew(true)
    const res = await fetch('/api/yard/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSvc.name.trim(), price: Number(newSvc.price) || 0 }),
    })
    const svc: YardService = await res.json()
    setServices(sv => [...sv, svc])
    setEditPrices(ep => ({ ...ep, [svc.id]: String(svc.price) }))
    setEditNames(en => ({ ...en, [svc.id]: svc.name }))
    setNewSvc({ name: '', price: '' })
    setAddingNew(false)
  }

  async function deleteService(id: string) {
    await fetch(`/api/yard/services/${id}`, { method: 'DELETE' })
    setServices(sv => sv.filter(s => s.id !== id))
  }

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
        <div className="flex items-center" style={{ gap: '10px' }}>
          <button
            onClick={openPriceModal}
            className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-colors"
            style={{ padding: '7px 14px', fontSize: '13px' }}
            title="עריכת מחירון שירותים"
          >
            ⚙️ מחירון
          </button>
          <div className="flex items-center gap-2 bg-green-700 text-white rounded-full text-sm font-semibold" style={{ padding: '6px 14px' }}>
            <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
            בשידור חי
          </div>
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

      {/* ── Price editor modal ── */}
      {priceModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '540px', maxWidth: '95vw', maxHeight: '85vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between border-b flex-shrink-0" style={{ padding: '18px 24px' }}>
              <h2 className="font-bold text-slate-900" style={{ fontSize: '18px' }}>⚙️ מחירון שירותים</h2>
              <button onClick={() => setPriceModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-xl">✕</button>
            </div>

            {/* Service rows */}
            <div className="overflow-y-auto flex-1">
              {services.length === 0 && (
                <div className="text-center text-slate-400 py-8">אין שירותים — הוסף למטה</div>
              )}

              {/* Quick-action section */}
              {(() => {
                const quickNames = new Set(['תיקון תקר', 'כיוון פרונט'])
                const quick = services.filter(s => quickNames.has(s.name))
                const menu  = services.filter(s => !quickNames.has(s.name))

                const SvcRow = ({ svc }: { svc: typeof services[0] }) => (
                  <div key={svc.id} className="flex items-center border-b border-slate-50" style={{ padding: '8px 24px', gap: '12px' }}>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={editNames[svc.id] ?? svc.name}
                        onChange={e => setEditNames(en => ({ ...en, [svc.id]: e.target.value }))}
                        onBlur={() => saveField(svc.id)}
                        className="w-full border-2 border-transparent rounded-lg font-medium text-slate-800 outline-none hover:border-slate-200 focus:border-blue-400 transition-colors"
                        style={{ padding: '6px 10px', fontSize: '14px', background: 'transparent' }}
                      />
                    </div>
                    <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-400 transition-colors" style={{ width: '100px', height: '38px' }}>
                      <input
                        type="number"
                        value={editPrices[svc.id] ?? ''}
                        onChange={e => setEditPrices(ep => ({ ...ep, [svc.id]: e.target.value }))}
                        onBlur={() => saveField(svc.id)}
                        className="flex-1 outline-none font-bold text-blue-600 text-center"
                        style={{ padding: '0 6px', fontSize: '15px', height: '100%', minWidth: 0 }}
                      />
                      <span className="text-slate-400 font-semibold" style={{ padding: '0 6px', fontSize: '13px' }}>₪</span>
                    </div>
                    <div style={{ width: '28px', textAlign: 'center' }}>
                      {saving === svc.id
                        ? <span className="text-green-500 font-bold text-sm">✓</span>
                        : <button onClick={() => deleteService(svc.id)} className="text-slate-300 hover:text-red-500 transition-colors" style={{ fontSize: '16px' }}>🗑</button>
                      }
                    </div>
                  </div>
                )

                return (
                  <>
                    {quick.length > 0 && (
                      <>
                        <div className="bg-slate-50 border-b" style={{ padding: '6px 24px' }}>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">🔧 כפתורים מהירים</span>
                        </div>
                        {quick.map(svc => <SvcRow key={svc.id} svc={svc} />)}
                      </>
                    )}
                    {menu.length > 0 && (
                      <>
                        <div className="bg-slate-50 border-b" style={{ padding: '6px 24px', marginTop: quick.length > 0 ? '4px' : 0 }}>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">⚙️ תפריט שירותים</span>
                        </div>
                        {menu.map(svc => <SvcRow key={svc.id} svc={svc} />)}
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Add new */}
            <div className="border-t flex-shrink-0" style={{ padding: '14px 24px' }}>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide" style={{ marginBottom: '8px' }}>הוסף שירות חדש</div>
              <div className="flex" style={{ gap: '10px' }}>
                <input
                  type="text"
                  placeholder="שם השירות"
                  value={newSvc.name}
                  onChange={e => setNewSvc(n => ({ ...n, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addService()}
                  className="flex-1 border-2 border-slate-200 rounded-xl outline-none font-medium focus:border-blue-400 transition-colors"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                />
                <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-400 transition-colors" style={{ width: '90px', height: '44px' }}>
                  <input
                    type="number"
                    placeholder="0"
                    value={newSvc.price}
                    onChange={e => setNewSvc(n => ({ ...n, price: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addService()}
                    className="flex-1 outline-none font-bold text-blue-600 text-center"
                    style={{ padding: '0 6px', fontSize: '14px', height: '100%', minWidth: 0 }}
                  />
                  <span className="text-slate-400 font-semibold" style={{ padding: '0 6px', fontSize: '13px' }}>₪</span>
                </div>
                <button
                  onClick={addService}
                  disabled={addingNew || !newSvc.name.trim()}
                  className="bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-xl font-bold transition-colors"
                  style={{ padding: '10px 18px', fontSize: '14px' }}
                >
                  {addingNew ? '...' : '+ הוסף'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
