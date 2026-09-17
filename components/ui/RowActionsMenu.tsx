'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current && !menuRef.current.contains(t)) setOpen(false)
    }
    function reposition() {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      setPos(align === 'start'
        ? { top: r.bottom + 4, left: r.left }
        : { top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    reposition()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, align])

  if (actions.length === 0) return null

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'inline-block' }}>
      <button
        ref={btnRef}
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
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, right: pos.right,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden',
          zIndex: 1000, minWidth: '150px',
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
        </div>,
        document.body
      )}
    </div>
  )
}
