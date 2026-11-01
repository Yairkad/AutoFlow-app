'use client'

import { useState } from 'react'
import StorageMap, { roomSize, toFree } from './StorageMap'
import { validateLayout, type StorageLayout, type StorageRow } from '@/lib/stock/storage'

// Admin editor for the cabinets map: rows of cabinets, each placed freely in the room (wall + arrows),
// direction, "shelves continue" flag, and its cabinets (letter + number of shelves).
// An older grid map is converted on open — every row stays where it was drawn.

const STEP = 20   // px per arrow press

const inp = 'border-2 border-slate-200 focus:border-blue-500 rounded-lg outline-none bg-white'

export default function StorageMapEditor({ initial, onSave, onCancel }: {
  initial: StorageLayout
  onSave: (l: StorageLayout) => Promise<void>
  onCancel: () => void
}) {
  const [layout, setLayout] = useState<StorageLayout>(() => toFree(JSON.parse(JSON.stringify(initial))))
  const [saving, setSaving] = useState(false)
  const err = validateLayout(layout)

  const setRow = (id: string, patch: Partial<StorageRow>) =>
    setLayout(l => ({ ...l, rows: l.rows.map(r => r.id === id ? { ...r, ...patch } : r) }))

  function nextLetter(): string {
    const used = new Set(layout.rows.flatMap(r => r.cabinets.map(c => c.code)))
    for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c }
    return 'Z'
  }

  function addRow() {
    const y = layout.rows.length ? roomSize(layout).h + 20 : 0
    setLayout(l => ({ ...l, rows: [...l.rows, { id: 'r' + Date.now(), name: 'שורה חדשה', x: 0, y, side: 'right', dir: 'h', contiguous: false, cabinets: [{ code: nextLetter(), shelves: 5 }] }] }))
  }

  async function save() {
    if (err) return
    setSaving(true)
    try { await onSave(layout) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-xl border border-slate-200" style={{ padding: 12 }}>
        <StorageMap layout={layout} />
      </div>

      {layout.rows.map(r => (
        <div key={r.id} className="bg-white rounded-xl border border-slate-200 flex flex-col gap-2" style={{ padding: 12 }}>
          <div className="flex flex-wrap items-center gap-2">
            <input className={inp} style={{ padding: '6px 10px', fontWeight: 700, flex: '1 1 140px' }} value={r.name}
              onChange={e => setRow(r.id, { name: e.target.value })} aria-label="שם השורה" />
            <button className="text-red-600 font-bold" style={{ fontSize: 13 }}
              onClick={() => setLayout(l => ({ ...l, rows: l.rows.filter(x => x.id !== r.id) }))}>מחק שורה</button>
          </div>

          <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 13 }}>
            <span className="font-bold text-slate-600">צמוד לקיר:</span>
            <span className="flex rounded-lg overflow-hidden border border-slate-300">
              {(['right', 'left'] as const).map(side => (
                <button key={side} onClick={() => setRow(r.id, { side, x: 0 })}
                  className={`font-bold ${(r.side ?? 'right') === side ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`} style={{ padding: '6px 12px' }}>
                  {side === 'right' ? 'ימין' : 'שמאל'}
                </button>
              ))}
            </span>
            <span className="font-bold text-slate-600">הזזה:</span>
            <span className="flex items-center gap-1">
              {/* x is measured from the row's wall: toward the left = away from the right wall, toward the left wall */}
              <button className="bg-slate-100 rounded-md font-black" style={{ width: 32, height: 32 }} aria-label="שמאלה"
                onClick={() => setRow(r.id, { x: r.side === 'left' ? Math.max(0, r.x - STEP) : r.x + STEP })}>←</button>
              <button className="bg-slate-100 rounded-md font-black" style={{ width: 32, height: 32 }} aria-label="ימינה"
                onClick={() => setRow(r.id, { x: r.side === 'left' ? r.x + STEP : Math.max(0, r.x - STEP) })}>→</button>
              <button className="bg-slate-100 rounded-md font-black" style={{ width: 32, height: 32 }} onClick={() => setRow(r.id, { y: Math.max(0, r.y - STEP) })} aria-label="למעלה">↑</button>
              <button className="bg-slate-100 rounded-md font-black" style={{ width: 32, height: 32 }} onClick={() => setRow(r.id, { y: r.y + STEP })} aria-label="למטה">↓</button>
            </span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={r.dir === 'v'} onChange={e => setRow(r.id, { dir: e.target.checked ? 'v' : 'h' })} />
              ארונות אחד מתחת לשני
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={r.contiguous} onChange={e => setRow(r.id, { contiguous: e.target.checked })} />
              מדפים רציפים (ממשיכים מארון לארון)
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {r.cabinets.map((c, i) => (
              <div key={i} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg" style={{ padding: '4px 6px' }}>
                <input className={inp} style={{ width: 40, padding: '4px', textAlign: 'center', fontWeight: 900 }} maxLength={1} value={c.code}
                  aria-label="אות הארון"
                  onChange={e => setRow(r.id, { cabinets: r.cabinets.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x) })} />
                <input className={inp} style={{ width: 46, padding: '4px', textAlign: 'center' }} type="number" min={1} max={20} value={c.shelves}
                  aria-label="מספר מדפים"
                  onChange={e => setRow(r.id, { cabinets: r.cabinets.map((x, j) => j === i ? { ...x, shelves: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } : x) })} />
                <span className="text-slate-500" style={{ fontSize: 12 }}>מדפים</span>
                <button className="text-red-500 font-black" style={{ width: 26 }} aria-label="מחק ארון"
                  onClick={() => setRow(r.id, { cabinets: r.cabinets.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200" style={{ padding: '6px 10px', fontSize: 13 }}
              onClick={() => setRow(r.id, { cabinets: [...r.cabinets, { code: nextLetter(), shelves: r.cabinets.at(-1)?.shelves ?? 5 }] })}>
              + ארון
            </button>
          </div>
        </div>
      ))}

      <button onClick={addRow} className="self-start bg-white border-2 border-dashed border-slate-300 rounded-xl font-bold text-slate-600" style={{ padding: '10px 16px' }}>
        + שורת ארונות
      </button>

      {err && <div className="text-red-600 font-bold">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="bg-slate-100 rounded-xl font-bold text-slate-700" style={{ padding: '10px 18px' }}>ביטול</button>
        <button onClick={save} disabled={!!err || saving} className="bg-green-700 text-white rounded-xl font-bold disabled:opacity-40" style={{ padding: '10px 18px' }}>
          {saving ? '⏳' : 'שמור תרשים'}
        </button>
      </div>
    </div>
  )
}
