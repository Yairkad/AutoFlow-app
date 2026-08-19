'use client'

import { useEffect, useRef, useState } from 'react'

export interface RowMenuAction {
  key: string
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  actions: RowMenuAction[]
  variant?: 'button' | 'plain'
  align?: 'start' | 'end'
}

export default function RowActionsMenu({ actions, variant = 'button', align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (actions.length === 0) return null

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="פעולות"
        style={variant === 'button' ? {
          width: 30, height: 30, border: '1px solid var(--border)', borderRadius: '6px',
          background: 'transparent', cursor: 'pointer', fontSize: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        } : {
          width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        }}
      >⋮</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', [align === 'start' ? 'left' : 'right']: 0,
          marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden',
          zIndex: 50, minWidth: '150px',
        }}>
          {actions.map((a, i) => (
            <button
              key={a.key}
              disabled={a.disabled}
              onClick={e => { e.stopPropagation(); setOpen(false); a.onClick() }}
              style={{
                width: '100%', textAlign: 'right', padding: '9px 14px', border: 'none',
                background: 'transparent', cursor: a.disabled ? 'not-allowed' : 'pointer',
                fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
                color: a.disabled ? 'var(--text-muted)' : a.danger ? 'var(--danger)' : 'var(--text)',
                opacity: a.disabled ? 0.5 : 1,
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              {a.icon && <span>{a.icon}</span>}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
