'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession, YardSessionItem, YardService } from '@/lib/yard/types'
import { sessionTotal, formatPlate } from '@/lib/yard/types'

interface Props {
  session:  YardSession
  services: YardService[]
}

export default function WorkCardClient({ session: initialSession, services }: Props) {
  const router = useRouter()
  const [session, setSession]         = useState<YardSession>(initialSession)
  const [confirmItem, setConfirmItem]  = useState<{ name: string; onConfirm: () => void } | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmBusy,  setConfirmBusy]  = useState(false)
  const [editItem,    setEditItem]     = useState<YardSessionItem | null>(null)
  const [priceDigits, setPriceDigits]  = useState('')
  const [error,       setError]        = useState<string | null>(null)
  const [sending,     setSending]      = useState(false)
  const [isMobile,    setIsMobile]     = useState(false)
  const supabase = createClient()
  const items = session.yard_session_items ?? []

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Prefetch sub-routes so navigation is instant
  useEffect(() => {
    router.prefetch(`/yard/${session.id}/tire`)
    router.prefetch(`/yard/${session.id}/service`)
    router.prefetch(`/yard/${session.id}/search?type=product`)
    router.prefetch(`/yard/${session.id}/search?type=all`)
  }, [session.id]) // eslint-disable-line

  useEffect(() => {
    const ch = supabase
      .channel(`session-${session.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'yard_session_items',
          filter: `session_id=eq.${session.id}` },
        () => router.refresh()
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session.id]) // eslint-disable-line

  // On mount: pick up item written by search page before navigating back
  useEffect(() => {
    try {
      const key = `yard-pending-${initialSession.id}`
      const raw = sessionStorage.getItem(key)
      if (!raw) return
      sessionStorage.removeItem(key)
      const pendingItem: YardSessionItem = JSON.parse(raw)
      setSession(s => {
        if (s.yard_session_items.some(i => i.ref_id === pendingItem.ref_id && i.name === pendingItem.name)) return s
        return { ...s, yard_session_items: [...s.yard_session_items, pendingItem] }
      })
    } catch {}
  }, []) // eslint-disable-line

  // Sync from server (router.refresh) — keep any still-unconfirmed temp/pending items
  useEffect(() => {
    setSession(prev => {
      const serverIds = new Set(initialSession.yard_session_items.map(i => i.id))
      const stillLocal = prev.yard_session_items.filter(
        i => (i.id.startsWith('temp-') || i.id.startsWith('pending-')) && !serverIds.has(i.id)
      )
      return { ...initialSession, yard_session_items: [...initialSession.yard_session_items, ...stillLocal] }
    })
  }, [initialSession]) // eslint-disable-line

  function showError(msg: string) {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }

  // Optimistic delete — remove immediately, revert on error
  function deleteItem(item: YardSessionItem) {
    setSession(s => ({ ...s, yard_session_items: s.yard_session_items.filter(i => i.id !== item.id) }))
    fetch(`/api/yard/sessions/${session.id}/items/${item.id}`, { method: 'DELETE' })
      .then(r => {
        if (!r.ok) {
          setSession(s => ({ ...s, yard_session_items: [...s.yard_session_items, item].sort((a,b) => a.created_at.localeCompare(b.created_at)) }))
          showError('שגיאה במחיקת פריט — נסה שוב')
        }
      })
      .catch(() => {
        setSession(s => ({ ...s, yard_session_items: [...s.yard_session_items, item].sort((a,b) => a.created_at.localeCompare(b.created_at)) }))
        showError('בעיית תקשורת — נסה שוב')
      })
  }

  function addQuickItem(name: string, price: number, serviceId?: string) {
    if (items.some(i => i.name === name)) {
      setConfirmBusy(false)
      setConfirmItem({ name, onConfirm: () => doAddQuick(name, price, serviceId) })
      return
    }
    doAddQuick(name, price, serviceId)
  }

  // Optimistic add — show item immediately, rollback on server error
  function doAddQuick(name: string, price: number, serviceId?: string) {
    setConfirmItem(null)
    const tempId = `temp-${Date.now()}`
    const tempItem: YardSessionItem = {
      id: tempId, session_id: session.id, tenant_id: '',
      item_type: 'service', ref_id: serviceId ?? null,
      name, sku: null, quantity: 1,
      unit_price: price, original_price: price, price_modified: false,
      created_at: new Date().toISOString(),
    }
    setSession(s => ({ ...s, yard_session_items: [...s.yard_session_items, tempItem] }))

    fetch(`/api/yard/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type: 'service', ref_id: serviceId ?? null,
        name, unit_price: price, quantity: 1,
        original_price: price, price_modified: false,
      }),
    }).then(r => r.ok ? r.json() : null).then(real => {
      if (real) {
        setSession(s => ({ ...s, yard_session_items: s.yard_session_items.map(i => i.id === tempId ? real : i) }))
      } else {
        // Rollback optimistic item and show error
        setSession(s => ({ ...s, yard_session_items: s.yard_session_items.filter(i => i.id !== tempId) }))
        setError('שגיאה בהוספת פריט — נסה שוב')
        setTimeout(() => setError(null), 3000)
      }
    }).catch(() => {
      setSession(s => ({ ...s, yard_session_items: s.yard_session_items.filter(i => i.id !== tempId) }))
      setError('בעיית תקשורת — נסה שוב')
      setTimeout(() => setError(null), 3000)
    })
  }

  // Await PATCH (fast ~200ms), show error and stay on page if it fails
  async function sendToOffice() {
    setSending(true)
    try {
      const r = await fetch(`/api/yard/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_office' }),
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) throw new Error()
      router.push('/yard')
    } catch {
      setSending(false)
      showError('שגיאה בשליחה למשרד — נסה שוב')
    }
  }

  async function closeEmpty() {
    setConfirmEmpty(false)
    setSending(true)
    try {
      const r = await fetch(`/api/yard/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) throw new Error()
      router.push('/yard')
    } catch {
      setSending(false)
      showError('שגיאה בסגירת כרטיס — נסה שוב')
    }
  }

  function handleFinish() {
    if (items.length === 0) { setConfirmEmpty(true); return }
    sendToOffice()
  }

  function incrementQty(item: YardSessionItem) {
    const newQty = item.quantity + 1
    setSession(s => ({
      ...s,
      yard_session_items: s.yard_session_items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i),
    }))
    fetch(`/api/yard/sessions/${session.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQty }),
    }).then(r => { if (!r.ok) throw new Error() }).catch(() => {
      setSession(s => ({
        ...s,
        yard_session_items: s.yard_session_items.map(i => i.id === item.id ? { ...i, quantity: item.quantity } : i),
      }))
      showError('שגיאה בעדכון כמות — נסה שוב')
    })
  }

  // Price edit
  function openEditItem(item: YardSessionItem) { setEditItem(item); setPriceDigits('') }

  function pressPriceKey(k: string) {
    if (k === 'del') { setPriceDigits(d => d.slice(0, -1)); return }
    if (priceDigits.length >= 5) return
    setPriceDigits(d => d + k)
  }

  function applyDiscount(amount: number) {
    if (!editItem) return
    setPriceDigits(String(Math.max(0, editItem.unit_price - amount)))
  }

  function confirmPrice() {
    if (!editItem) return
    const newPrice = priceDigits === '' ? editItem.unit_price : Number(priceDigits)
    setEditItem(null)
    if (newPrice === editItem.unit_price) return
    const snapshot = editItem
    // Optimistic update
    setSession(s => ({
      ...s,
      yard_session_items: s.yard_session_items.map(i =>
        i.id === snapshot.id ? { ...i, unit_price: newPrice, price_modified: true } : i
      ),
    }))
    fetch(`/api/yard/sessions/${session.id}/items/${snapshot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_price: newPrice }),
    }).then(r => {
      if (!r.ok) throw new Error()
    }).catch(() => {
      // Revert price
      setSession(s => ({
        ...s,
        yard_session_items: s.yard_session_items.map(i =>
          i.id === snapshot.id ? { ...i, unit_price: snapshot.unit_price, price_modified: snapshot.price_modified } : i
        ),
      }))
      showError('שגיאה בעדכון מחיר — נסה שוב')
    })
  }

  const total = sessionTotal(items)
  const hasMakeModel = session.make || session.model

  function svcPrice(name: string, fallback: number) {
    return services.find(s => s.name === name)?.price ?? fallback
  }

  const navActions = [
    { key: 'tire',    label: '🏁 צמיג חדש',       to: `/yard/${session.id}/tire` },
    { key: 'service', label: '⚙️ חיישנים / איזון', to: `/yard/${session.id}/service` },
    { key: 'accs',    label: '🛒 אביזרים לרכב',   to: `/yard/${session.id}/search?type=product` },
    { key: 'all',     label: '🔍 כל המלאי',        to: `/yard/${session.id}/search?type=all` },
  ]

  const quickActions = [
    { key: 'flat',  label: '🔧 תיקון תקר',   fn: () => addQuickItem('תיקון תקר',  svcPrice('תיקון תקר',  50)) },
    { key: 'align', label: '🚗 כיוון פרונט', fn: () => addQuickItem('כיוון פרונט', svcPrice('כיוון פרונט', 120)) },
  ]

  // Interleave: tire, flat, service, align, accs, all
  const actionOrder = [
    navActions[0], quickActions[0],
    navActions[1], quickActions[1],
    navActions[2], navActions[3],
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {/* ── Plate header card ── */}
      <div className="bg-white border-[3px] border-red-500 rounded-xl flex-shrink-0" style={{ margin: '14px 14px 0', padding: '14px 18px' }}>
        {hasMakeModel && (
          <div className="text-lg font-bold text-slate-700 leading-tight">
            {[session.make, session.model].filter(Boolean).join(' ')}
            {session.year && <span className="text-slate-400 font-normal mr-1">· {session.year}</span>}
          </div>
        )}
        <div className="font-black text-slate-900 leading-tight" style={{ fontSize: '22px', letterSpacing: '2px' }}>
          {formatPlate(session.plate)}
        </div>
      </div>

      {/* ── Back button ── */}
      <div className="flex-shrink-0" style={{ margin: '10px 14px 0' }}>
        <button
          onClick={() => router.push('/yard')}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:scale-[.97] text-white rounded-xl font-bold transition-all"
          style={{ minHeight: '52px', fontSize: '16px' }}
        >
          🏠 חזור לרחבה הראשית
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="flex-shrink-0 bg-red-600 text-white font-semibold text-center" style={{ margin: '8px 14px 0', padding: '10px 16px', borderRadius: '10px', fontSize: '14px' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Work body ── */}
      <div className="flex flex-1 min-h-0" style={{ flexDirection: isMobile ? 'column' : 'row', gap: '14px', margin: '12px 14px 14px' }}>

        {/* Action buttons — 2 columns */}
        <div className="grid grid-cols-2" style={{ gap: '12px', alignContent: 'start', flex: isMobile ? '0 0 auto' : '1' }}>
          {actionOrder.map(a => {
            const isNav = 'to' in a
            return (
              <button
                key={a.key}
                onClick={() => isNav ? router.push(a.to) : a.fn()}
                className="text-white rounded-2xl font-bold flex items-center justify-center text-center shadow-sm active:scale-[.95] active:brightness-90 transition-all"
                style={{
                  minHeight: '88px', fontSize: '17px', padding: '12px',
                  background: '#15803d',
                }}
              >
                {a.label}
              </button>
            )
          })}
        </div>

        {/* ── Cart panel ── */}
        <div
          className="flex flex-col bg-white rounded-2xl overflow-hidden"
          style={{ width: isMobile ? '100%' : '310px', flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,.12)', minHeight: isMobile ? '220px' : undefined }}
        >
          <div className="bg-blue-700 text-white font-bold text-center flex-shrink-0" style={{ padding: '14px 16px', fontSize: '15px' }}>
            שירותים שהתקבלו
          </div>

          <div className="flex-1 overflow-y-auto" style={{ paddingTop: '4px' }}>
            {items.length === 0 ? (
              <div className="p-5 text-center text-slate-400">הסל ריק</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-center border-b border-slate-100 last:border-0" style={{ gap: '8px', padding: '8px 14px' }}>
                  <button onClick={() => openEditItem(item)} className="flex-1 min-w-0 text-right">
                    <div className="font-semibold text-slate-900" style={{ fontSize: '14px' }}>{item.name}</div>
                    <div className="text-slate-500 flex items-center" style={{ fontSize: '12px', gap: '4px', marginTop: '2px' }}>
                      <span>כמות: {item.quantity}</span>
                      {item.price_modified && (
                        <span className="bg-amber-100 text-amber-700 rounded font-bold" style={{ fontSize: '11px', padding: '1px 5px' }}>שונה</span>
                      )}
                    </div>
                  </button>
                  <button onClick={() => openEditItem(item)} className="font-bold text-blue-600 whitespace-nowrap flex-shrink-0" style={{ fontSize: '15px' }}>
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </button>
                  <button
                    onClick={() => incrementQty(item)}
                    className="font-black text-green-600 hover:text-green-800 leading-none flex-shrink-0 active:scale-90 transition-all"
                    style={{ fontSize: '22px', width: '28px', textAlign: 'center' }}
                  >+</button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="text-slate-300 hover:text-red-500 leading-none flex-shrink-0 transition-colors"
                    style={{ fontSize: '18px' }}
                  >🗑</button>
                </div>
              ))
            )}
          </div>

          <div className="border-t-2 border-slate-200 flex justify-between items-center font-black flex-shrink-0" style={{ padding: '12px 16px', fontSize: '16px' }}>
            <span>סה״כ</span>
            <span>{total.toLocaleString()}₪</span>
          </div>

          <button
            onClick={handleFinish}
            disabled={sending}
            className="text-white font-bold transition-colors flex-shrink-0 active:brightness-90 disabled:opacity-60"
            style={{ background: items.length === 0 ? '#475569' : '#b45309', padding: '20px 16px', fontSize: '17px' }}
          >
            {sending ? '⏳ שולח...' : items.length === 0 ? 'סגור כרטיס' : 'סיים ושלח לתשלום'}
          </button>
        </div>
      </div>

      {/* Empty cart confirm */}
      {confirmEmpty && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '92%', maxWidth: '400px', padding: '36px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '20px', marginBottom: '10px' }}>סגירת כרטיס</div>
            <div className="text-slate-500" style={{ fontSize: '16px', marginBottom: '32px' }}>הסל ריק — האם אין חיוב לרכב זה?</div>
            <div className="flex" style={{ gap: '14px', padding: '0 12px' }}>
              <button onClick={() => setConfirmEmpty(false)}
                disabled={confirmBusy}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500 active:scale-95 active:bg-slate-50 transition-all disabled:opacity-50"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                ביטול
              </button>
              <button onClick={() => { setConfirmBusy(true); closeEmpty() }}
                disabled={confirmBusy}
                className="flex-1 bg-slate-700 text-white rounded-xl font-bold active:scale-95 active:bg-slate-800 transition-all disabled:opacity-60"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                {confirmBusy ? '⏳' : 'כן, סגור כרטיס'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item price edit modal ── */}
      {editItem && (() => {
        const displayPrice = priceDigits === '' ? editItem.unit_price : Number(priceDigits)
        return (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '320px', maxWidth: '95vw' }}>
              <div className="flex items-start justify-between border-b" style={{ padding: '16px 20px' }}>
                <div>
                  <div className="font-bold text-slate-900" style={{ fontSize: '16px' }}>{editItem.name}</div>
                  <div className="text-slate-400" style={{ fontSize: '13px', marginTop: '2px' }}>
                    מחיר מקורי: {editItem.unit_price.toLocaleString()}₪
                  </div>
                </div>
                <button onClick={() => setEditItem(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
              </div>
              <div className="text-center font-black text-blue-600" style={{ padding: '14px 20px 8px', fontSize: '36px' }}>
                {displayPrice.toLocaleString()}₪
              </div>
              <div className="flex" style={{ gap: '8px', padding: '0 20px 12px' }}>
                {[20, 50, 100].map(d => (
                  <button key={d} onClick={() => applyDiscount(d)}
                    className="flex-1 bg-amber-50 border-2 border-amber-300 text-amber-700 rounded-xl font-bold active:bg-amber-100"
                    style={{ padding: '10px 4px', fontSize: '14px' }}>
                    -{d}₪
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3" dir="ltr" style={{ gap: '8px', padding: '0 20px 16px' }}>
                {['1','2','3','4','5','6','7','8','9'].map(k => (
                  <button key={k} onClick={() => pressPriceKey(k)}
                    className="bg-slate-100 rounded-xl font-bold text-slate-800 active:bg-slate-200"
                    style={{ fontSize: '22px', padding: '12px' }}>{k}</button>
                ))}
                <button onClick={confirmPrice}
                  className="bg-blue-600 rounded-xl font-bold text-white active:bg-blue-700"
                  style={{ fontSize: '16px', padding: '12px' }}>✓ אישור</button>
                <button onClick={() => pressPriceKey('0')}
                  className="bg-slate-100 rounded-xl font-bold text-slate-800 active:bg-slate-200"
                  style={{ fontSize: '22px', padding: '12px' }}>0</button>
                <button onClick={() => pressPriceKey('del')}
                  className="bg-slate-100 rounded-xl font-bold text-red-500 active:bg-slate-200"
                  style={{ fontSize: '20px', padding: '12px' }}>⌫</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '92%', maxWidth: '400px', padding: '36px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '20px', marginBottom: '10px' }}>{confirmItem.name}</div>
            <div className="text-slate-500" style={{ fontSize: '16px', marginBottom: '32px' }}>כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex" style={{ gap: '14px', padding: '0 12px' }}>
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500 active:bg-slate-50"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 bg-green-700 text-white rounded-xl font-bold active:bg-green-800"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
