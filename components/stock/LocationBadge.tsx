'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseLocation, type StorageLayout } from '@/lib/stock/storage'
import StorageMap from './StorageMap'

// "📍 B3 ⓘ" — the ⓘ opens the cabinets map with the shelf marked, for whoever can't find it.

let layoutPromise: Promise<StorageLayout | null> | null = null
export function fetchLayout(): Promise<StorageLayout | null> {
  layoutPromise ??= fetch('/api/yard/storage-map')
    .then(r => r.ok ? r.json() : null)
    .then(d => d?.layout ?? null)
    .catch(() => { layoutPromise = null; return null })
  return layoutPromise
}

/** After the map is edited, so badges on this page show the new one. */
export function resetLayoutCache() { layoutPromise = null }

export function LocationMapModal({ location, onClose }: { location: string; onClose: () => void }) {
  const [layout, setLayout] = useState<StorageLayout | null | undefined>(undefined)
  useEffect(() => { fetchLayout().then(setLayout) }, [])
  const shelves = parseLocation(location)
  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} role="dialog" aria-label="מיקום במחסן"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, direction: 'rtl' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 16, width: 'min(560px, 100%)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>📍 <bdi dir="ltr">{location}</bdi></div>
          <button onClick={onClose} aria-label="סגור" style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', width: 40, height: 40 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          {shelves.length
            ? <>האות = הארון, המספר = המדף מלמעלה (1 = המדף העליון). המדף מסומן בכתום.</>
            : <>המיקום לא בפורמט של ארון ומדף (למשל B3).</>}
        </div>
        {layout === undefined && <div style={{ color: '#94a3b8' }}>טוען תרשים...</div>}
        {layout === null && <div style={{ color: '#b91c1c' }}>לא ניתן לטעון את התרשים</div>}
        {layout && <StorageMap layout={layout} highlight={new Set(shelves)} />}
      </div>
    </div>
  )
}

export default function LocationBadge({ location, size = 13 }: { location: string | null | undefined; size?: number }) {
  const [open, setOpen] = useState(false)
  if (!location) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
      📍 <bdi dir="ltr">{location}</bdi>
      {/* span, not button: the badge often sits inside a clickable row/button */}
      <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setOpen(true) } }}
        aria-label="איפה זה? פתח תרשים ארונות" title="איפה זה?"
        style={{ border: '1.5px solid currentColor', borderRadius: '50%', width: size + 7, height: size + 7, fontSize: size - 2, fontWeight: 900,
          lineHeight: 1, background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        i
      </span>
      {/* portal: keep the dialog out of the clickable parent row */}
      {open && createPortal(<LocationMapModal location={location} onClose={() => setOpen(false)} />, document.body)}
    </span>
  )
}
