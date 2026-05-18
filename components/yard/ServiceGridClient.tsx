'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, YardService } from '@/lib/yard/types'
import { sessionDisplayName, formatPlate } from '@/lib/yard/types'

interface Props { session: YardSession; services: YardService[] }

export default function ServiceGridClient({ session, services }: Props) {
  const router = useRouter()
  const [confirm, setConfirm]     = useState<{ svc: YardService; onYes: () => void } | null>(null)
  const [adding,  setAdding]      = useState<string | null>(null)
  const existingNames = new Set((session.yard_session_items ?? []).map(i => i.name))

  async function addService(svc: YardService) {
    if (existingNames.has(svc.name)) {
      setConfirm({ svc, onYes: () => doAdd(svc) })
      return
    }
    doAdd(svc)
  }

  async function doAdd(svc: YardService) {
    setConfirm(null)
    setAdding(svc.id)
    await fetch(`/api/yard/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type:  'service',
        ref_id:     svc.id,
        name:       svc.name,
        sku:        svc.sku,
        quantity:   1,
        unit_price: svc.price,
        original_price: svc.price,
      }),
    })
    setAdding(null)
    router.push(`/yard/${session.id}`)
  }

  const display = sessionDisplayName(session)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b-4 border-red-500 px-4 py-3 flex-shrink-0">
        <div className="text-lg font-bold text-slate-800">{display}</div>
        <div className="text-xl font-black tracking-widest text-slate-900">{formatPlate(session.plate)}</div>
      </div>

      {/* Nav */}
      <div className="flex gap-2 px-3 pt-2 flex-shrink-0">
        <button onClick={() => router.push(`/yard/${session.id}`)}
          className="flex-1 bg-white border-2 border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-bold active:scale-97">
          ← חזור לכרטיס עבודה
        </button>
        <button onClick={() => router.push('/yard')}
          className="flex-1 bg-slate-800 text-white rounded-xl py-3 text-sm font-bold active:scale-97">
          🏠 רחבה ראשית
        </button>
      </div>

      <div className="px-3 pt-2 pb-1 text-xs text-slate-400 font-semibold uppercase tracking-wide flex-shrink-0">
        בחר שירות — יתווסף לסל מיידית
      </div>

      {/* Service grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {services.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">אין שירותים מוגדרים</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {services.map(svc => (
              <button
                key={svc.id}
                onClick={() => addService(svc)}
                disabled={adding === svc.id}
                className="bg-green-700 hover:bg-green-800 active:scale-95 disabled:opacity-60 text-white rounded-2xl p-5 flex flex-col items-center gap-1.5 shadow-md transition-all font-bold text-center"
              >
                <span className="text-base leading-tight">{svc.name}</span>
                <span className="text-sm font-medium opacity-90">{svc.price.toLocaleString()}₪</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Duplicate confirm */}
      {confirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <div className="text-lg font-bold mb-1">{confirm.svc.name}</div>
            <div className="text-slate-500 mb-5">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-500">ביטול</button>
              <button onClick={confirm.onYes} className="flex-1 py-3 bg-green-700 text-white rounded-xl font-bold">כן, הוסף</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
