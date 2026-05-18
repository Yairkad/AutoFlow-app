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

  // Realtime: sync cart items
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
    const existing = items.filter(i => i.name === name)
    if (existing.length > 0) {
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
        price,
        unit_price: price,
        quantity:   1,
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

  const ActionBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="bg-green-700 hover:bg-green-800 active:scale-95 text-white rounded-2xl text-lg font-bold flex items-center justify-center text-center p-3 transition-all shadow-md leading-snug"
    >{label}</button>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Plate header */}
      <div className="bg-white border-b-4 border-red-500 px-4 py-3 flex-shrink-0">
        <div className="text-lg font-bold text-slate-800">{display} {session.year && `(${session.year})`}</div>
        <div className="text-2xl font-black tracking-widest text-slate-900">{formatPlate(session.plate)}</div>
      </div>

      {/* Back button */}
      <div className="px-3 pt-2 flex-shrink-0">
        <button
          onClick={() => router.push('/yard')}
          className="w-full bg-slate-800 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 active:scale-98"
        >🏠 חזור לרחבה הראשית</button>
      </div>

      {/* Main body */}
      <div className="flex flex-1 gap-3 p-3 min-h-0">

        {/* Action buttons */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <ActionBtn label="🏁 צמיג חדש"        onClick={() => router.push(`/yard/${session.id}/tire`)} />
          <ActionBtn label="🔧 תיקון תקר"        onClick={() => addQuickItem('תיקון תקר', 50)} />
          <ActionBtn label="⚙️ חיישנים / איזון"  onClick={() => router.push(`/yard/${session.id}/service`)} />
          <ActionBtn label="🚗 כיוון פרונט"      onClick={() => addQuickItem('כיוון פרונט', 120)} />
          <ActionBtn label="🛒 אביזרים לרכב"    onClick={() => router.push(`/yard/${session.id}/search?type=product`)} />
          <ActionBtn label="🔍 כל המלאי"         onClick={() => router.push(`/yard/${session.id}/search?type=all`)} />
        </div>

        {/* Cart panel */}
        <div className="w-64 flex flex-col bg-white rounded-2xl shadow-md overflow-hidden flex-shrink-0">
          <div className="bg-blue-700 text-white px-4 py-3 text-sm font-bold flex-shrink-0">🛒 סל נוכחי</div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">הסל ריק</div>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 leading-tight truncate">{item.name}</div>
                    <div className="text-xs text-slate-400">
                      כמות: {item.quantity}
                      {item.price_modified && <span className="mr-1 text-amber-600 font-bold">• שונה</span>}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-blue-600 whitespace-nowrap">
                    {(item.unit_price * item.quantity).toLocaleString()}₪
                  </div>
                  <button onClick={() => deleteItem(item)} className="text-slate-300 hover:text-red-500 text-base flex-shrink-0">🗑</button>
                </div>
              ))
            )}
          </div>

          <div className="border-t-2 border-slate-100 px-4 py-2 flex justify-between text-base font-black flex-shrink-0">
            <span>סה״כ</span>
            <span>{total.toLocaleString()}₪</span>
          </div>

          <button
            onClick={sendToOffice}
            disabled={items.length === 0 || sending}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white py-4 text-base font-bold transition-colors flex-shrink-0"
          >
            {sending ? '...' : 'סיים ושלח לתשלום'}
          </button>
        </div>
      </div>

      {/* Duplicate confirm dialog */}
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
