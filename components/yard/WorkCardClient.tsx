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
        item_type:  'service',
        ref_id:     serviceId ?? null,
        name,
        unit_price: price,
        quantity:   1,
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
    { label: 'צמיג חדש',        icon: '🏁', onClick: () => router.push(`/yard/${session.id}/tire`) },
    { label: 'תיקון תקר',        icon: '🔧', onClick: () => addQuickItem('תיקון תקר', 50) },
    { label: 'חיישנים / איזון',  icon: '⚙️', onClick: () => router.push(`/yard/${session.id}/service`) },
    { label: 'כיוון פרונט',      icon: '🚗', onClick: () => addQuickItem('כיוון פרונט', 120) },
    { label: 'אביזרים לרכב',    icon: '🛒', onClick: () => router.push(`/yard/${session.id}/search?type=product`) },
    { label: 'כל המלאי',         icon: '🔍', onClick: () => router.push(`/yard/${session.id}/search?type=all`) },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Header — car info + back button */}
      <div className="bg-white border-b-4 border-red-500 px-4 py-3 flex-shrink-0 flex items-center gap-4">
        <button
          onClick={() => router.push('/yard')}
          className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xl font-bold flex items-center justify-center flex-shrink-0 transition-all"
        >🏠</button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-slate-700 truncate">
            {display}{session.year ? ` — ${session.year}` : ''}
          </div>
          <div className="text-2xl font-black tracking-widest text-slate-900 leading-tight">
            {formatPlate(session.plate)}
          </div>
        </div>
      </div>

      {/* Main body */}
      <div className="flex flex-1 gap-3 p-3 min-h-0">

        {/* ── Action buttons: 3×2 grid ── */}
        <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="bg-green-700 hover:bg-green-800 active:scale-95 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span className="text-3xl leading-none">{a.icon}</span>
              <span className="text-base leading-snug text-center px-2">{a.label}</span>
            </button>
          ))}
        </div>

        {/* ── Cart panel ── */}
        <div className="w-64 flex flex-col bg-white rounded-2xl shadow-md overflow-hidden flex-shrink-0">

          {/* Cart header */}
          <div className="bg-blue-700 text-white px-4 py-3 text-sm font-bold flex-shrink-0">
            🛒 סל נוכחי
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">הסל ריק</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      כמות: {item.quantity}
                      {item.price_modified && <span className="mr-1 text-amber-600 font-bold">• שונה</span>}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-blue-600 whitespace-nowrap">
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </div>
                  <button
                    onClick={() => deleteItem(item)}
                    className="text-slate-300 hover:text-red-500 text-base leading-none flex-shrink-0 mt-0.5"
                  >✕</button>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div className="border-t-2 border-slate-100 px-4 py-2.5 flex justify-between items-center text-base font-black flex-shrink-0 bg-slate-50">
            <span className="text-slate-500 font-semibold text-sm">סה״כ</span>
            <span className="text-lg">{total.toLocaleString()}₪</span>
          </div>

          {/* Send button */}
          <button
            onClick={sendToOffice}
            disabled={items.length === 0 || sending}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white py-4 text-base font-bold transition-colors flex-shrink-0 active:scale-98"
          >
            {sending ? '...' : 'סיים ושלח לתשלום'}
          </button>
        </div>
      </div>

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <div className="text-lg font-bold mb-1">{confirmItem.name}</div>
            <div className="text-slate-500 mb-5">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-500">
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 py-3 bg-green-700 text-white rounded-xl font-bold">
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
