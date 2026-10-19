'use client'

import { shelvesOfCabinet, type StorageLayout, type StorageRow } from '@/lib/stock/storage'

// Rows of cabinets sit on a grid inside the room outline (x = cabinet widths from the right,
// y = map row). 'h' row: cabinets side by side, each a column with shelf 1 on top.
// 'v' row (cabinets along a side wall): one cabinet per line — letter, then shelves 1→N.
// A contiguous row is drawn with no gap — its shelves continue into the next cabinet.

const CAB_W   = 54
const SHELF_H = 30
const HEAD_H  = 26
const GAP     = 8    // between separate cabinets
const ROW_GAP = 30   // between map rows (room for the row name)
const V_HEAD  = 24   // 'v' row: letter cell width
const V_SHELF = 26   // 'v' row: shelf cell width
const V_ROW   = 30   // 'v' row: height of one cabinet line

interface Props {
  layout: StorageLayout
  selected?: Set<string>                                    // shelves picked for a count
  highlight?: Set<string>                                   // "the tire is here"
  onShelf?: (shelf: string) => void
  onCabinet?: (code: string) => void
  cabinetTint?: Record<string, { bg: string; color: string }>
  shelfBadge?: Record<string, string | number>
}

function rowSize(r: StorageRow) {
  const maxShelves = Math.max(1, ...r.cabinets.map(c => c.shelves))
  const cabH = HEAD_H + maxShelves * SHELF_H
  const gap = r.contiguous ? 0 : GAP
  return r.dir === 'h'
    ? { w: r.cabinets.length * CAB_W + Math.max(0, r.cabinets.length - 1) * gap, h: cabH }
    : { w: V_HEAD + maxShelves * V_SHELF + 4, h: r.cabinets.length * (V_ROW + 4) + Math.max(0, r.cabinets.length - 1) * gap }
}

export default function StorageMap({ layout, selected, highlight, onShelf, onCabinet, cabinetTint, shelfBadge }: Props) {
  // Each map row (y) is as tall as its tallest cabinet row
  const levels = [...new Set(layout.rows.map(r => r.y))].sort((a, b) => a - b)
  const levelTop = new Map<number, number>()
  let top = 0
  for (const y of levels) {
    levelTop.set(y, top + 18)
    top += 18 + Math.max(...layout.rows.filter(r => r.y === y).map(r => rowSize(r).h)) + ROW_GAP
  }
  const width = Math.max(CAB_W, ...layout.rows.map(r => r.x * (CAB_W + GAP) + rowSize(r).w))

  return (
    <div style={{ overflowX: 'auto', direction: 'rtl', maxWidth: '100%' }}>
      {/* the room */}
      <div style={{ position: 'relative', width: width + 16, height: top + 6, margin: '0 auto', border: '2px dashed #cbd5e1', borderRadius: 10, padding: 8, boxSizing: 'content-box' }}>
        {layout.rows.map(r => {
          const right = r.x * (CAB_W + GAP)
          const t = levelTop.get(r.y) ?? 0
          const gap = r.contiguous ? 0 : GAP
          return (
            <div key={r.id} style={{ position: 'absolute', right: right + 8, top: t + 8 }}>
              <div style={{ position: 'absolute', top: -18, right: 0, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 700 }}>
                {r.name}{r.contiguous && r.cabinets.length > 1 ? ' · מדפים רציפים' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: r.dir === 'h' ? 'row' : 'column', gap }}>
                {r.dir === 'v' && r.cabinets.map(c => {
                  const tint = cabinetTint?.[c.code]
                  return (
                    <div key={c.code} style={{ display: 'flex', border: '2px solid #334155', borderRadius: 6, background: '#fff', overflow: 'hidden', height: V_ROW + 4 }}>
                      <button type="button" onClick={() => onCabinet?.(c.code)} disabled={!onCabinet}
                        style={{ width: V_HEAD, border: 'none', borderLeft: '2px solid #334155', fontWeight: 900, fontSize: 15, flexShrink: 0,
                          background: tint?.bg ?? '#e2e8f0', color: tint?.color ?? '#0f172a', cursor: onCabinet ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                        {c.code}
                      </button>
                      {shelvesOfCabinet(c).map((s, i) => {
                        const sel = selected?.has(s)
                        const hi  = highlight?.has(s)
                        const badge = shelfBadge?.[s]
                        return (
                          <button key={s} type="button" onClick={() => onShelf?.(s)} disabled={!onShelf} title={`${s} — מדף ${i + 1} מלמעלה`}
                            style={{
                              position: 'relative', width: V_SHELF, border: 'none', padding: 0, flexShrink: 0,
                              borderRight: i ? '1px solid #cbd5e1' : 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: sel || hi ? 900 : 600,
                              background: hi ? '#f59e0b' : sel ? '#2563eb' : '#fff',
                              color: hi || sel ? '#fff' : '#475569', cursor: onShelf ? 'pointer' : 'default',
                            }}>
                            {s}
                            {badge !== undefined && badge !== '' && (
                              <span style={{ position: 'absolute', top: 0, left: 1, fontSize: 9, fontWeight: 900, color: sel || hi ? '#fff' : '#16a34a' }}>{badge}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
                {r.dir === 'h' && r.cabinets.map(c => {
                  const tint = cabinetTint?.[c.code]
                  return (
                    <div key={c.code} style={{ width: CAB_W, border: '2px solid #334155', borderRadius: 6, background: '#fff', overflow: 'hidden' }}>
                      <button type="button" onClick={() => onCabinet?.(c.code)} disabled={!onCabinet}
                        style={{ width: '100%', height: HEAD_H - 2, border: 'none', borderBottom: '2px solid #334155', fontWeight: 900, fontSize: 15,
                          background: tint?.bg ?? '#e2e8f0', color: tint?.color ?? '#0f172a', cursor: onCabinet ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                        {c.code}
                      </button>
                      {shelvesOfCabinet(c).map((s, i) => {
                        const sel = selected?.has(s)
                        const hi  = highlight?.has(s)
                        const badge = shelfBadge?.[s]
                        return (
                          <button key={s} type="button" onClick={() => onShelf?.(s)} disabled={!onShelf}
                            style={{
                              position: 'relative', display: 'block', width: '100%', height: SHELF_H, border: 'none', padding: 0,
                              borderTop: i ? '1px solid #cbd5e1' : 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: sel || hi ? 900 : 600,
                              background: hi ? '#f59e0b' : sel ? '#2563eb' : '#fff',
                              color: hi || sel ? '#fff' : '#475569', cursor: onShelf ? 'pointer' : 'default',
                            }}>
                            {s}
                            {badge !== undefined && badge !== '' && (
                              <span style={{ position: 'absolute', top: 1, left: 2, fontSize: 10, fontWeight: 900, color: sel || hi ? '#fff' : '#16a34a' }}>{badge}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
