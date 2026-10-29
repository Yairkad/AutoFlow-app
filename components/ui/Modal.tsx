'use client'

import { useEffect, useRef } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: number
  /** false: the content survives closing (kept by the caller), so no unsaved-changes guard */
  guard?: boolean
}

// Once something was typed in the window, a stray click outside never closes it,
// and ✕ / Escape ask before throwing the typed details away.
export default function Modal({ open, onClose, title, children, footer, maxWidth = 560, guard = true }: Props) {
  const { confirm } = useConfirm()
  const dirty = useRef(false)
  useEffect(() => { if (open) dirty.current = false }, [open])

  const requestClose = async () => {
    if (dirty.current && !(await confirm({ msg: 'יש פרטים שלא נשמרו — לסגור בלי לשמור?', confirmLabel: 'סגור בלי לשמור', icon: '⚠️' }))) return
    onClose()
  }
  const closeRef = useRef(requestClose)
  useEffect(() => { closeRef.current = requestClose })

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={() => { if (!dirty.current) onClose() }}
      onInput={() => { if (guard) dirty.current = true }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 'var(--radius)',
          width: '100%', maxWidth,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,.18)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: '#fff',
          borderRadius: 'var(--radius) var(--radius) 0 0',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{title}</h3>
          <button
            onClick={requestClose}
            aria-label="סגור"
            style={{
              background: '#f1f5f9', border: 'none', cursor: 'pointer',
              fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1,
              width: 28, height: 28, borderRadius: '7px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: '#f8fafc',
            display: 'flex', justifyContent: 'flex-end', gap: '8px',
            borderRadius: '0 0 var(--radius) var(--radius)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
