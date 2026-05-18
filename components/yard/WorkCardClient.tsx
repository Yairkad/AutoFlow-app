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

  const total = sessionTotal(items)
  const hasMakeModel = session.make || session.model

  const actions = [
    { label: '🏁 צמיג חדש',       onClick: () => router.push(`/yard/${session.id}/tire`) },
    { label: '🔧 תיקון תקר',       onClick: () => addQuickItem('תיקון תקר', 50) },
    { label: '⚙️ חיישנים / איזון', onClick: () => router.push(`/yard/${session.id}/service`) },
    { label: '🚗 כיוון פרונט',     onClick: () => addQuickItem('כיוון פרונט', 120) },
    { label: '🛒 אביזרים לרכב',   onClick: () => router.push(`/yard/${session.id}/search?type=product`) },
    { label: '🔍 כל המלאי',        onClick: () => router.push(`/yard/${session.id}/search?type=all`) },
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
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="bg-green-700 hover:bg-green-600 active:scale-95 text-white rounded-2xl font-bold flex items-center justify-center text-center transition-all shadow-sm"
              style={{ minHeight: '88px', fontSize: '17px', padding: '12px' }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* ── Cart panel ── */}
        <div
          className="flex flex-col bg-white rounded-2xl overflow-hidden flex-shrink-0"
          style={{ width: '270px', boxShadow: '0 2px 10px rgba(0,0,0,.12)' }}
        >
          <div className="bg-blue-700 text-white px-4 py-3.5 text-[15px] font-bold flex-shrink-0">
            🛒 סל נוכחי
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '280px' }}>
            {items.length === 0 ? (
              <div className="p-5 text-center text-slate-400 text-sm">הסל ריק</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-start gap-1.5 px-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      <span>כמות: {item.quantity}</span>
                      {item.price_modified && (
                        <span className="bg-amber-100 text-amber-700 text-[11px] px-1.5 rounded font-bold">שונה</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-blue-600 whitespace-nowrap">
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </div>
                  <button
                    onClick={() => deleteItem(item)}
                    className="text-slate-300 hover:text-red-500 text-base leading-none flex-shrink-0 transition-colors"
                  >🗑</button>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t-2 border-slate-200 flex justify-between items-center text-base font-black flex-shrink-0">
            <span>סה״כ</span>
            <span>{total.toLocaleString()}₪</span>
          </div>

          <button
            onClick={sendToOffice}
            disabled={items.length === 0 || sending}
            className="text-white py-4 text-base font-bold transition-colors flex-shrink-0 disabled:opacity-40"
            style={{ background: '#b45309' }}
          >
            {sending ? 'שולח...' : 'סיים ושלח לתשלום'}
          </button>
        </div>
      </div>

      {/* Duplicate confirm */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-7 w-[90%] max-w-[360px] text-center shadow-xl">
            <div className="text-lg font-bold mb-2 text-slate-900">{confirmItem.name}</div>
            <div className="text-slate-500 mb-6">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 py-3.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-500 text-base">
                ביטול
              </button>
              <button onClick={confirmItem.onConfirm}
                className="flex-1 py-3.5 bg-green-700 text-white rounded-xl font-bold text-base">
                כן, הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
