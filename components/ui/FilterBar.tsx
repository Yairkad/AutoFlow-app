'use client'

import { useEffect, useState, type ReactNode } from 'react'

export interface FilterChip { key: string; label: string; onRemove: () => void }

interface Props {
  /** Remembers whether the filters panel was open (per screen) */
  storageKey: string
  search: string
  onSearch: (v: string) => void
  placeholder?: string
  /** Active filters, shown as removable chips next to the button */
  chips?: FilterChip[]
  onClearAll?: () => void
  /** The filter controls, shown when "סינון" is open */
  children?: ReactNode
  /** Extra controls kept on the search row (e.g. the screen's MoreMenu) */
  end?: ReactNode
}

/**
 * Search is always visible; the filters open from a "סינון" button right next to it (never hidden
 * inside a menu). Active filters show as chips so it's clear what is filtered without opening it.
 */
export default function FilterBar({ storageKey, search, onSearch, placeholder = 'חיפוש...', chips = [], onClearAll, children, end }: Props) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { setOpen(localStorage.getItem(`filters-open:${storageKey}`) === '1') } catch {}
  }, [storageKey])
  const toggle = () => {
    setOpen(o => {
      try { localStorage.setItem(`filters-open:${storageKey}`, o ? '0' : '1') } catch {}
      return !o
    })
  }
  const active = chips.length

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0, maxWidth: '420px', display: 'flex', alignItems: 'center' }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="form-input" type="search" aria-label="חיפוש" placeholder={placeholder}
            value={search} onChange={e => onSearch(e.target.value)} style={{ paddingRight: 30, width: '100%', margin: 0 }} />
        </div>
        {children && (
          <button type="button" onClick={toggle} aria-expanded={open}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
              background: active ? '#eff6ff' : 'var(--bg-card)', color: active ? 'var(--primary)' : 'var(--text)',
            }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            סינון{active ? ` (${active})` : ''} {open ? '▴' : '▾'}
          </button>
        )}
        {chips.map(c => (
          <button key={c.key} type="button" onClick={c.onRemove} aria-label={`הסר סינון ${c.label}`}
            style={{ padding: '4px 10px', borderRadius: '999px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {c.label} ✕
          </button>
        ))}
        {(active > 0 || search) && onClearAll && (
          <button type="button" onClick={onClearAll}
            style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--danger)', background: '#fef2f2', color: 'var(--danger)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            נקה הכל
          </button>
        )}
        {end && <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>{end}</div>}
      </div>
      {children && open && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          {children}
        </div>
      )}
    </div>
  )
}
