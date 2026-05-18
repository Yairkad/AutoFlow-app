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
  const [sending,       setSending]      = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [confirmItem,   setConfirmItem]  = useState<{ name: string; onConfirm: () => void } | null>(null)
  const [confirmEmpty,  setConfirmEmpty] = useState(false)
  const supabase = createClient()
  const items    = session.yard_session_items ?? []

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

  async function deleteItem(item: YardSessionItem) {
    await fetch(`/api/yard/sessions/${session.id}/items/${item.id}`, { method: 'DELETE' })
    setSession(s => ({ ...s, yard_session_items: s.yard_session_items.filter(i => i.id !== item.id) }))
  }

  async function addQuickItem(name: string, price: number, serviceId?: string) {
    if (items.some(i => i.name === name)) {
      setLoadingAction(null) // release button — user must confirm dialog
      setConfirmItem({ name, onConfirm: () => doAddQuick(name, price, serviceId) })
      return
    }
    await doAddQuick(name, price, serviceId)
    setLoadingAction(null)
  }

  async function doAddQuick(name: string, price: number, serviceId?: string) {
    setConfirmItem(null)
    const res = await fetch(`/api/yard/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type:      'service',
        ref_id:         serviceId ?? null,
        name,
        unit_price:     price,
        quantity:       1,
        original_price: price,
        price_modified: false,
      }),
    })
    if (res.ok) {
      const item = await res.json()
      setSession(s => ({ ...s, yard_session_items: [...s.yard_session_items, item] }))
    }
  }

  async function sendToOffice() {
    setSending(true)
    await fetch(`/api/yard/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending_office' }),
    })
    router.push('/yard')
  }

  async function closeEmpty() {
    setConfirmEmpty(false)
    setSending(true)
    await fetch(`/api/yard/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    router.push('/yard')
  }

  function handleFinish() {
    if (items.length === 0) { setConfirmEmpty(true); return }
    sendToOffice()
  }

  const total = sessionTotal(items)
  const hasMakeModel = session.make || session.model

  function svcPrice(name: string, fallback: number) {
    return services.find(s => s.name === name)?.price ?? fallback
  }

  async function pressAction(key: string, fn: () => void | Promise<void>) {
    if (loadingAction) return
    setLoadingAction(key)
    await Promise.resolve(fn())
  }

  const actions = [
    { key: 'tire',    label: '🏁 צמיג חדש',       fn: () => router.push(`/yard/${session.id}/tire`) },
    { key: 'flat',    label: '🔧 תיקון תקר',       fn: () => addQuickItem('תיקון תקר',  svcPrice('תיקון תקר', 50)) },
    { key: 'service', label: '⚙️ חיישנים / איזון', fn: () => router.push(`/yard/${session.id}/service`) },
    { key: 'align',   label: '🚗 כיוון פרונט',     fn: () => addQuickItem('כיוון פרונט', svcPrice('כיוון פרונט', 120)) },
    { key: 'accs',    label: '🛒 אביזרים לרכב',   fn: () => router.push(`/yard/${session.id}/search?type=product`) },
    { key: 'all',     label: '🔍 כל המלאי',        fn: () => router.push(`/yard/${session.id}/search?type=all`) },
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

      {/* ── Work body ── */}
      <div className="flex flex-1 min-h-0" style={{ gap: '14px', margin: '12px 14px 14px' }}>

        {/* Action buttons — 2 columns */}
        <div className="flex-1 grid grid-cols-2" style={{ gap: '12px', alignContent: 'start' }}>
          {actions.map(a => {
            const isThis  = loadingAction === a.key
            const anyBusy = loadingAction !== null
            return (
              <button
                key={a.key}
                onClick={() => pressAction(a.key, a.fn)}
                disabled={anyBusy}
                className="text-white rounded-2xl font-bold flex items-center justify-center text-center shadow-sm transition-colors"
                style={{
                  minHeight: '88px', fontSize: '17px', padding: '12px',
                  background: isThis ? '#64748b' : '#15803d',
                  opacity: anyBusy && !isThis ? 0.5 : 1,
                  animation: isThis ? 'btn-loading 0.7s ease-in-out infinite' : 'none',
                }}
              >
                {isThis ? '⏳' : a.label}
              </button>
            )
          })}
        </div>

        {/* ── Cart panel ── */}
        <div
          className="flex flex-col bg-white rounded-2xl overflow-hidden flex-shrink-0"
          style={{ width: '310px', boxShadow: '0 2px 10px rgba(0,0,0,.12)' }}
        >
          <div className="bg-blue-700 text-white font-bold text-center flex-shrink-0" style={{ padding: '14px 16px', fontSize: '15px' }}>
            שירותים שהתקבלו
          </div>

          <div className="flex-1 overflow-y-auto" style={{ paddingTop: '4px' }}>
            {items.length === 0 ? (
              <div className="p-5 text-center text-slate-400">הסל ריק</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-start border-b border-slate-100 last:border-0" style={{ gap: '8px', padding: '10px 14px' }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900" style={{ fontSize: '14px' }}>{item.name}</div>
                    <div className="text-slate-500 flex items-center" style={{ fontSize: '12px', gap: '4px', marginTop: '2px' }}>
                      <span>כמות: {item.quantity}</span>
                      {item.price_modified && (
                        <span className="bg-amber-100 text-amber-700 rounded font-bold" style={{ fontSize: '11px', padding: '1px 5px' }}>שונה</span>
                      )}
                    </div>
                  </div>
                  <div className="font-bold text-blue-600 whitespace-nowrap" style={{ fontSize: '15px' }}>
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </div>
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
            className="text-white font-bold transition-colors flex-shrink-0 disabled:opacity-40"
            style={{ background: items.length === 0 ? '#475569' : '#b45309', padding: '20px 16px', fontSize: '17px' }}
          >
            {sending ? 'שולח...' : items.length === 0 ? 'סגור כרטיס' : 'סיים ושלח לתשלום'}
          </button>
        </div>
      </div>

      {/* Empty cart confirm */}
      {confirmEmpty && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '90%', maxWidth: '360px', padding: '32px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '18px', marginBottom: '10px' }}>סגירת כרטיס</div>
            <div className="text-slate-500" style={{ fontSize: '15px', marginBottom: '28px' }}>הסל ריק — האם אין חיוב לרכב זה?</div>
            <div className="flex" style={{ gap: '12px' }}>
              <button onClick={() => setConfirmEmpty(false)}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500"
                style={{ padding: '14px', fontSize: '15px' }}>
                ביטול
              </button>
              <button onClick={closeEmpty}
                className="flex-1 bg-slate-700 text-white rounded-xl font-bold"
                style={{ padding: '14px', fontSize: '15px' }}>
                כן, סגור כרטיס
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '90%', maxWidth: '360px', padding: '32px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '18px', marginBottom: '10px' }}>{confirmItem.name}</div>
            <div className="text-slate-500" style={{ fontSize: '15px', marginBottom: '28px' }}>כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex" style={{ gap: '12px' }}>
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500"
                style={{ padding: '14px', fontSize: '15px' }}>
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 bg-green-700 text-white rounded-xl font-bold"
                style={{ padding: '14px', fontSize: '15px' }}>
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
