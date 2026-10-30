'use client'

import { useEffect, useState } from 'react'
import StorageMap from './StorageMap'
import { fetchLayout } from './LocationBadge'
import { formatLocation, parseLocation, type StorageLayout } from '@/lib/stock/storage'
import type { LocationSuggestion } from '@/lib/stock/server'

// After receiving a tire: "put it on B3" (where it already sits / where this size usually goes).
// Only a suggestion — the location is saved when the worker confirms where it actually went.

export interface Placement { id: string; name: string; suggest: LocationSuggestion | null }

export default function PlacementSheet({ p, onDone }: { p: Placement; onDone: (msg?: string) => void }) {
  const [layout, setLayout] = useState<StorageLayout | null>(null)
  const [other, setOther] = useState(!p.suggest)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { fetchLayout().then(setLayout) }, [])

  async function save(location: string) {
    setSaving(true); setErr(null)
    const r = await fetch('/api/yard/tire-location', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, location }),
    })
    setSaving(false)
    if (!r.ok) { setErr((await r.json().catch(() => null))?.error ?? 'שגיאה בשמירה'); return }
    onDone(`📍 ${p.name} — נשמר ב-${location}`)
  }

  const suggested = new Set(parseLocation(p.suggest?.location))
  const picked = formatLocation([...pick])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', padding: 12 }}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col gap-3" style={{ width: 520, maxWidth: '96vw', maxHeight: '92dvh', overflowY: 'auto', padding: 18, direction: 'rtl' }}>
        <div>
          <p className="font-black text-slate-800" style={{ fontSize: 20 }}>לאן לשים?</p>
          <p className="text-slate-500" style={{ fontSize: 14 }}>{p.name}</p>
        </div>

        {p.suggest && !other && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl" style={{ padding: '10px 14px' }}>
            <div className="font-black text-amber-900" style={{ fontSize: 22 }}><bdi dir="ltr">{p.suggest.location}</bdi></div>
            <div className="text-amber-800" style={{ fontSize: 13 }}>
              {p.suggest.reason === 'existing' ? 'כאן כבר נמצא הצמיג הזה' : 'הצעה: כאן שמים בדרך כלל צמיגים במידה דומה'}
            </div>
          </div>
        )}

        {layout && (
          <StorageMap layout={layout} highlight={other ? undefined : suggested} selected={other ? pick : undefined}
            onShelf={other ? s => setPick(cur => { const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n }) : undefined} />
        )}
        {other && <div className="text-slate-600" style={{ fontSize: 14 }}>סמן בתרשים איפה שמת{picked ? <> — <b><bdi dir="ltr">{picked}</bdi></b></> : ''}</div>}
        {err && <div className="text-red-600 font-bold">{err}</div>}

        <div className="flex flex-col gap-2">
          {!other && p.suggest && (
            <button disabled={saving} onClick={() => save(p.suggest!.location)}
              className="bg-green-700 text-white rounded-xl font-black disabled:opacity-40" style={{ padding: 14, fontSize: 17 }}>
              ✓ שמתי ב-<bdi dir="ltr">{p.suggest.location}</bdi>
            </button>
          )}
          {!other && (
            <button onClick={() => setOther(true)} className="bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-bold" style={{ padding: 12, fontSize: 15 }}>
              שמתי במקום אחר
            </button>
          )}
          {other && (
            <button disabled={saving || !picked} onClick={() => picked && save(picked)}
              className="bg-green-700 text-white rounded-xl font-black disabled:opacity-40" style={{ padding: 14, fontSize: 17 }}>
              ✓ שמור מיקום{picked ? <> <bdi dir="ltr">{picked}</bdi></> : ''}
            </button>
          )}
          <button onClick={() => onDone()} className="text-slate-500 font-bold" style={{ padding: 8, fontSize: 14 }}>דלג — לא עכשיו</button>
        </div>
      </div>
    </div>
  )
}
