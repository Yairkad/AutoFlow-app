'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, YardService } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'

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

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      {/* Plate header card */}
      <div className="bg-white border-[3px] border-red-500 rounded-xl flex-shrink-0" style={{ margin: '14px 14px 0', padding: '14px 18px' }}>
        {(session.make || session.model) && (
          <div className="text-lg font-bold text-slate-700 leading-tight">
            {[session.make, session.model].filter(Boolean).join(' ')}
            {session.year && <span className="text-slate-400 font-normal mr-1">· {session.year}</span>}
          </div>
        )}
        <div className="font-black text-slate-900 leading-tight" style={{ fontSize: '22px', letterSpacing: '2px' }}>
          {formatPlate(session.plate)}
        </div>
        <div className="text-sm font-semibold text-slate-400 mt-0.5">שירותים</div>
      </div>

      {/* Nav */}
      <div className="flex gap-2 flex-shrink-0" style={{ margin: '10px 14px 0' }}>
        <button onClick={() => router.push(`/yard/${session.id}`)}
          className="flex-1 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-bold active:scale-[.97] hover:bg-slate-50 transition-all"
          style={{ minHeight: '52px', fontSize: '15px' }}>
          ← חזור לכרטיס עבודה
        </button>
        <button onClick={() => router.push('/yard')}
          className="flex-1 bg-slate-800 text-white rounded-xl font-bold active:scale-[.97] hover:bg-slate-700 transition-all"
          style={{ minHeight: '52px', fontSize: '15px' }}>
          🏠 רחבה ראשית
        </button>
      </div>

      {/* Service grid */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '10px 14px 14px' }}>
        {services.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">אין שירותים מוגדרים</div>
        ) : (
          <div className="grid grid-cols-3" style={{ gap: '12px' }}>
            {services.map(svc => (
              <button
                key={svc.id}
                onClick={() => addService(svc)}
                disabled={adding === svc.id}
                className="bg-green-700 hover:bg-green-800 active:scale-95 disabled:opacity-60 text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm transition-all font-bold text-center"
                style={{ minHeight: '88px', padding: '16px 12px' }}
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
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '92%', maxWidth: '400px', padding: '36px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '20px', marginBottom: '10px' }}>{confirm.svc.name}</div>
            <div className="text-slate-500" style={{ fontSize: '16px', marginBottom: '32px' }}>כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex" style={{ gap: '14px', padding: '0 12px' }}>
              <button onClick={() => setConfirm(null)}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500 active:bg-slate-50"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                ביטול
              </button>
              <button onClick={confirm.onYes}
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
