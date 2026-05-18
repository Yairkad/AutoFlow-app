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

      {/* ── Header ── */}
      <div className="bg-white border-b-2 border-slate-200 flex-shrink-0 flex items-stretch">
        <button
          onClick={() => router.push('/yard')}
          className="flex flex-col items-center justify-center px-6 py-4 gap-1 bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900 transition-colors flex-shrink-0"
        >
          <span className="text-2xl leading-none">🏠</span>
          <span className="text-xs font-semibold">רחבה</span>
        </button>
        <div className="flex-1 px-6 py-4">
          <div className="text-2xl font-black tracking-widest text-slate-900 leading-tight">
            {formatPlate(session.plate)}
          </div>
          <div className="text-sm font-semibold text-slate-500 mt-0.5">
            {display}{session.year ? ` · ${session.year}` : ''}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Blue cart panel ── */}
        <div className="w-72 bg-blue-700 flex flex-col flex-shrink-0 text-white">
          <div className="px-5 pt-5 pb-3 border-b border-blue-600 flex-shrink-0">
            <div className="text-base font-black">🛒 סל נוכחי</div>
            <div className="text-xs text-blue-200 mt-0.5">{items.length} פריטים</div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-blue-300 py-8">
                <span className="text-4xl">🛒</span>
                <span className="text-sm font-medium">הסל ריק</span>
              </div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-600/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold leading-tight">{item.name}</div>
                    <div className="text-xs text-blue-200 mt-0.5 flex items-center gap-1.5">
                      <span>כמות: {item.quantity}</span>
                      {item.price_modified && (
                        <span className="bg-amber-400/30 text-amber-200 px-1.5 rounded text-xs font-bold">שונה</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold whitespace-nowrap text-blue-100">
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </span>
                  <button
                    onClick={() => deleteItem(item)}
                    className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-red-500 flex items-center justify-center text-xs text-blue-200 hover:text-white transition-colors flex-shrink-0"
                  >✕</button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-blue-600 px-5 py-4 flex items-center justify-between flex-shrink-0 bg-blue-800/50">
            <span className="text-sm text-blue-200">סה״כ</span>
            <span className="text-xl font-black">{total.toLocaleString()}₪</span>
          </div>

          <button
            onClick={sendToOffice}
            disabled={items.length === 0 || sending}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-blue-800 disabled:text-blue-500 text-white py-5 text-base font-black transition-colors flex-shrink-0"
          >
            {sending ? 'שולח...' : 'סיים ושלח לתשלום ✓'}
          </button>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex-1 p-6 flex items-start">
          <div
            className="w-full grid grid-cols-3 gap-4"
            style={{ gridTemplateRows: 'repeat(2, minmax(0, 7rem))' }}
          >
            {actions.map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="bg-green-700 hover:bg-green-600 active:bg-green-800 active:scale-95 text-white rounded-xl font-semibold flex flex-col items-center justify-center gap-2 transition-all shadow-sm"
              >
                <span className="text-2xl leading-none">{a.icon}</span>
                <span className="text-sm font-semibold leading-snug text-center">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="text-lg font-bold mb-1 text-slate-800">{confirmItem.name}</div>
            <div className="text-slate-500 mb-5 text-sm">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-semibold text-slate-500 text-sm hover:bg-slate-50">
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 py-3 bg-green-700 text-white rounded-xl font-semibold text-sm hover:bg-green-600">
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
