'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fuzzyIncludes, normalizeSearch } from '@/lib/search/fuzzy'

export interface AutocompleteOption {
  value: string
  /** Extra text matched and shown beside the value (e.g. the Hebrew name of a brand) */
  hint?: string
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'>

interface Props extends InputProps {
  value: string
  onChange: (value: string) => void
  options: AutocompleteOption[]
  /** Max suggestions shown (default 8) */
  max?: number
}

/**
 * Free-text input that suggests existing values while typing — to keep one spelling per value
 * (brands etc.). Matches any part of the word, spelling-tolerant, also by hint.
 * Arrows + Enter / click pick; Esc closes; typing something new is still allowed.
 * The list is portaled to <body> (position:fixed) so it isn't clipped inside tables / modals.
 */
export default function AutocompleteInput({ value, onChange, options, max = 8, onKeyDown, onFocus, onBlur, style, ...rest }: Props) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const q = value.trim()
  const exact = normalizeSearch(q)
  const shown = (q
    ? options.filter(o => fuzzyIncludes(`${o.value} ${o.hint ?? ''}`, q))
    : options
  ).filter(o => normalizeSearch(o.value) !== exact).slice(0, max)
  const visible = open && shown.length > 0

  function place() {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: r.width })
  }

  useEffect(() => {
    if (!visible) return
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [visible])

  function pick(o: AutocompleteOption) { onChange(o.value); setOpen(false); setActive(-1) }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (visible) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); return }
      if (e.key === 'Enter' && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return }
      if (e.key === 'Tab' && active >= 0 && shown[active]) pick(shown[active])
    }
    onKeyDown?.(e)
  }

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); place() }}
        onFocus={e => { setOpen(true); place(); onFocus?.(e) }}
        onBlur={e => { setOpen(false); setActive(-1); onBlur?.(e) }}
        onClick={() => { setOpen(true); place() }}
        onKeyDown={onKey}
        style={style}
      />
      {visible && rect && createPortal(
        <ul id={listId} role="listbox" dir="rtl" style={{
          position: 'fixed', top: rect.top, left: rect.left, width: Math.max(rect.width, 160), zIndex: 2000,
          maxHeight: 260, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none',
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,.14)',
        }}>
          {shown.map((o, i) => (
            <li key={o.value} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(o) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 6,
                fontSize: 14, cursor: 'pointer', color: 'var(--text, #0f172a)',
                background: i === active ? 'var(--primary-soft, #eff6ff)' : 'transparent',
              }}>
              <span dir="ltr" style={{ fontWeight: 600 }}>{o.value}</span>
              {o.hint && <span style={{ color: 'var(--text-muted, #64748b)', fontSize: 12.5 }}>{o.hint}</span>}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
