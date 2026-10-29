'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { fuzzyIncludes } from '@/lib/search/fuzzy'

export interface SearchOption { value: string; label: string }

interface Props {
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  /** Label of the empty choice (value ''), e.g. "— ללא ספק ספציפי —" */
  emptyLabel?: string
  placeholder?: string
  ariaLabel?: string
}

/**
 * A select you can type into: typing filters the list (spelling-tolerant), arrows + Enter pick.
 * Drop-in for a long <select> of suppliers / customers.
 */
export default function SearchSelect({ options, value, onChange, emptyLabel, placeholder = 'הקלד לחיפוש...', ariaLabel }: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = options.find(o => o.value === value)
  const all: SearchOption[] = [...(emptyLabel ? [{ value: '', label: emptyLabel }] : []), ...options]
  const shown = query.trim() ? options.filter(o => fuzzyIncludes(o.label, query)) : all

  function close() { setOpen(false); setQuery('') }
  function pick(o: SearchOption) { onChange(o.value); close() }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && shown[active]) { e.preventDefault(); pick(shown[active]) } }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close() }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-label={ariaLabel}
        value={open ? query : (selected?.label ?? (value ? '' : emptyLabel ?? ''))}
        placeholder={open ? (selected?.label ?? placeholder) : placeholder}
        onFocus={() => { setOpen(true); setActive(0) }}
        onClick={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={onKey}
        style={{ width: '100%', fontWeight: 400 }}
      />
      {open && (
        <ul id={listId} role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 2px)', right: 0, left: 0, zIndex: 50, maxHeight: 240, overflowY: 'auto',
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', margin: 0, padding: 0, listStyle: 'none',
        }}>
          {shown.length === 0 && <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>לא נמצא</li>}
          {shown.map((o, i) => (
            <li key={o.value || '__empty'} role="option" aria-selected={o.value === value}
              onMouseDown={e => { e.preventDefault(); pick(o) }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '8px 12px', fontSize: '13px', fontWeight: o.value === value ? 700 : 400, cursor: 'pointer',
                background: i === active ? '#eff6ff' : 'transparent', color: o.value ? 'var(--text)' : 'var(--text-muted)',
              }}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
