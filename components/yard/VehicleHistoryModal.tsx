'use client'

import { useEffect, useState } from 'react'
import TireDiagram from '@/components/yard/TireDiagram'
import type { TirePosition } from '@/lib/yard/types'

interface HistoryItem {
  name: string
  unit_price: number
  quantity: number
  item_type: string
  tire_position: TirePosition | null
}

interface HistorySession {
  id: string
  closed_at: string
  make: string | null
  model: string | null
  year: string | null
  yard_session_items: HistoryItem[]
}

interface Props {
  plate: string
  onClose: () => void
}

const POS_NAMES: Record<TirePosition, string> = {
  FL: 'קדמי שמאל', FR: 'קדמי ימין',
  RL: 'אחורי שמאל', RR: 'אחורי ימין',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function sessionTotal(items: HistoryItem[]) {
  return items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
}

function tirePosFromSession(items: HistoryItem[]): TirePosition[] {
  return items
    .filter(i => i.item_type === 'tire' && i.tire_position)
    .map(i => i.tire_position!)
}

export default function VehicleHistoryModal({ plate, onClose }: Props) {
  const [sessions, setSessions] = useState<HistorySession[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/yard/vehicle-history?plate=${encodeURIComponent(plate)}`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => setError(true))
  }, [plate])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white flex flex-col rounded-t-2xl mt-auto overflow-hidden"
        style={{ maxHeight: '85dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b flex-shrink-0" style={{ padding: '16px 20px' }}>
          <div>
            <p className="font-black text-slate-900" style={{ fontSize: '20px', letterSpacing: '2px' }}>{plate}</p>
            {sessions && (
              <p className="text-slate-400 font-medium" style={{ fontSize: '13px' }}>
                {sessions.length === 0 ? 'אין ביקורים קודמים' : `${sessions.length} ביקורים קודמים`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold rounded-lg transition-colors"
            style={{ fontSize: '22px', padding: '4px 10px' }}
          >✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1" style={{ padding: '12px 16px', gap: '12px', display: 'flex', flexDirection: 'column' }}>
          {!sessions && !error && (
            <p className="text-center text-slate-400 py-8">טוען...</p>
          )}
          {error && (
            <p className="text-center text-red-400 py-8">שגיאה בטעינת היסטוריה</p>
          )}
          {sessions?.length === 0 && (
            <p className="text-center text-slate-400 py-8">הרכב מגיע בפעם הראשונה</p>
          )}
          {sessions?.map(s => {
            const tirePositions = tirePosFromSession(s.yard_session_items)
            const hasTires = tirePositions.length > 0
            return (
              <div
                key={s.id}
                className="border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* Visit header */}
                <div className="bg-slate-50 flex items-center justify-between border-b" style={{ padding: '10px 14px' }}>
                  <div>
                    <span className="font-bold text-slate-700" style={{ fontSize: '15px' }}>
                      {formatDate(s.closed_at)}
                    </span>
                    {(s.make || s.model) && (
                      <span className="text-slate-400 font-medium" style={{ fontSize: '13px', marginRight: '8px' }}>
                        {[s.make, s.model, s.year].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </div>
                  <span className="font-black text-slate-700" style={{ fontSize: '15px' }}>
                    {sessionTotal(s.yard_session_items).toLocaleString()}₪
                  </span>
                </div>

                {/* Visit body */}
                <div className="flex gap-3" style={{ padding: '12px 14px' }}>
                  {hasTires && (
                    <TireDiagram positions={tirePositions} size={70} />
                  )}
                  <ul className="flex-1 flex flex-col gap-1">
                    {s.yard_session_items.map((item, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-slate-700 font-medium" style={{ fontSize: '14px' }}>
                          {item.quantity > 1 && (
                            <span className="text-slate-400 ml-1">{item.quantity}×</span>
                          )}
                          {item.name}
                          {item.tire_position && (
                            <span className="text-green-600 font-semibold" style={{ fontSize: '12px', marginRight: '6px' }}>
                              ({POS_NAMES[item.tire_position]})
                            </span>
                          )}
                        </span>
                        <span className="text-slate-500 font-medium" style={{ fontSize: '13px', flexShrink: 0, marginRight: '8px' }}>
                          {(item.unit_price * item.quantity).toLocaleString()}₪
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
