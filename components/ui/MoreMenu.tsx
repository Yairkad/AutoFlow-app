'use client'

import { useEffect, useRef, useState } from 'react'
import type { RowMenuAction } from '@/components/ui/RowActionsMenu'

interface Props {
  actions: RowMenuAction[]
  /** Excel export / import as menu items (replaces a separate ExcelMenu button) */
  excel?: { onExport: () => void; onImport?: (e: React.ChangeEvent<HTMLInputElement>) => void }
  label?: string
}

/**
 * Toolbar "⋯ עוד" dropdown: the screen's secondary actions (print, Excel, monthly jobs…) live here
 * so the toolbar keeps one primary button. Search and filters never go in here.
 */
export default function MoreMenu({ actions, excel, label = '⋯ עוד' }: Props) {
  const [open, setOpen] = useState(false)
  const ref     = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const items: RowMenuAction[] = [
    ...actions,
    ...(excel ? [{ key: 'xls-out', label: 'ייצוא Excel', icon: '📤', onClick: excel.onExport }] : []),
    ...(excel?.onImport ? [{ key: 'xls-in', label: 'ייבוא Excel', icon: '📥', onClick: () => fileRef.current?.click() }] : []),
  ]
  if (!items.length) return null

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
          border: '1px solid var(--border)', fontSize: '13px', cursor: 'pointer', background: 'var(--bg-card)',
          color: 'var(--text)', fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: '190px', zIndex: 300, overflow: 'hidden',
        }}>
          {items.map((a, i) => (
            <button key={a.key} type="button" disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick() }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px',
                border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none',
                cursor: a.disabled ? 'not-allowed' : 'pointer', opacity: a.disabled ? 0.5 : 1, fontFamily: 'inherit',
                fontSize: '13px', color: a.danger ? 'var(--danger)' : 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap',
              }}>
              {a.icon && <span aria-hidden="true">{a.icon}</span>}{a.label}
            </button>
          ))}
        </div>
      )}
      {excel?.onImport && (
        <input ref={fileRef} type="file" accept=".xlsx,.xls" aria-label="ייבוא Excel" style={{ display: 'none' }}
          onChange={e => { excel.onImport!(e); e.target.value = '' }} />
      )}
    </div>
  )
}
