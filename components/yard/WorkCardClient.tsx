'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession, YardSessionItem, YardService } from '@/lib/yard/types'
import { sessionDisplayName, sessionTotal, formatPlate } from '@/lib/yard/types'

interface Props {
  session:  YardSession
  services: YardService[]
}

export default function WorkCardClient({ session: initialSession, services }: Props) {
  const router = useRouter()
  const [session, setSession]         = useState<YardSession>(initialSession)
  const [sending,  setSending]        = useState(false)
  const [confirmItem, setConfirmItem] = useState<{ name: string; onConfirm: () => void } | null>(null)
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
      setConfirmItem({ name, onConfirm: () => doAddQuick(name, price, serviceId) })
      return
    }
    doAddQuick(name, price, serviceId)
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

  const total   = sessionTotal(items)
  const display = sessionDisplayName(session)

  const actions = [
    { label: 'צמיג חדש',       icon: '🏁', onClick: () => router.push(`/yard/${session.id}/tire`) },
    { label: 'תיקון תקר',       icon: '🔧', onClick: () => addQuickItem('תיקון תקר', 50) },
    { label: 'חיישנים / איזון', icon: '⚙️', onClick: () => router.push(`/yard/${session.id}/service`) },
    { label: 'כיוון פרונט',     icon: '🚗', onClick: () => addQuickItem('כיוון פרונט', 120) },
    { label: 'אביזרים לרכב',   icon: '🛒', onClick: () => router.push(`/yard/${session.id}/search?type=product`) },
    { label: 'כל המלאי',        icon: '🔍', onClick: () => router.push(`/yard/${session.id}/search?type=all`) },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* ── Header: plate + make/model ── */}
      <div className="bg-white border-b-4 border-red-500 px-6 py-5 flex-shrink-0 text-center">
        <div className="text-3xl font-black tracking-widest text-slate-900 mb-1">
          {formatPlate(session.plate)}
        </div>
        <div className="text-lg font-bold text-slate-600">
          {display}{session.year ? ` · ${session.year}` : ''}
        </div>
      </div>

      {/* ── Back button ── */}
      <div className="px-4 py-3 flex-shrink-0">
        <button
          onClick={() => router.push('/yard')}
          className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-xl py-4 text-base font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <span className="text-xl">🏠</span>
          <span>חזור לרחבה הראשית</span>
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 gap-4 px-4 pb-4 min-h-0">

        {/* Action buttons 3×2 */}
        <div
          className="flex-1 grid grid-cols-3 gap-3 content-start"
          style={{ gridTemplateRows: 'repeat(2, minmax(0, 7.5rem))' }}
        >
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="bg-green-700 hover:bg-green-600 active:bg-green-800 active:scale-95 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all shadow"
            >
              <span className="text-3xl leading-none">{a.icon}</span>
              <span className="text-base font-bold leading-snug text-center px-2">{a.label}</span>
            </button>
          ))}
        </div>

        {/* ── Cart panel ── */}
        <div className="w-80 flex flex-col rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-white">

          {/* Cart title */}
          <div className="bg-blue-700 text-white px-5 py-4 flex-shrink-0">
            <div className="text-lg font-black">🛒 סל נוכחי</div>
            <div className="text-sm text-blue-200 mt-0.5">{items.length} פריטים</div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-slate-300">
                <span className="text-5xl mb-3">🛒</span>
                <span className="text-base font-medium">הסל ריק</span>
              </div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-slate-800 leading-tight">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-400">כמות: {item.quantity}</span>
                      {item.price_modified && (
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">שונה</span>
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-black text-blue-600 whitespace-nowrap">
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </div>
                  <button
                    onClick={() => deleteItem(item)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center text-sm font-bold transition-colors flex-shrink-0"
                  >✕</button>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div className="bg-slate-50 border-t-2 border-slate-200 px-5 py-4 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-slate-500">סה״כ לתשלום</span>
            <span className="text-2xl font-black text-slate-900">{total.toLocaleString()}₪</span>
          </div>

          {/* Send */}
          <button
            onClick={sendToOffice}
            disabled={items.length === 0 || sending}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-white py-5 text-lg font-black transition-colors flex-shrink-0"
          >
            {sending ? 'שולח...' : 'סיים ושלח לתשלום ✓'}
          </button>
        </div>
      </div>

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-sm text-center shadow-2xl">
            <div className="text-xl font-black mb-2 text-slate-800">{confirmItem.name}</div>
            <div className="text-slate-500 mb-6 text-base">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 py-4 border-2 border-slate-200 rounded-xl font-bold text-slate-500 text-base hover:bg-slate-50">
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 py-4 bg-green-700 text-white rounded-xl font-bold text-base hover:bg-green-600">
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
