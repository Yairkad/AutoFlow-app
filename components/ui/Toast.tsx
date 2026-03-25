'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  msg: string
  type: ToastType
}

interface ToastCtx {
  showToast: (msg: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const COLORS: Record<ToastType, string> = {
  success: '#16a34a',
  error:   '#dc2626',
  info:    '#2563eb',
}

const ICON_BG: Record<ToastType, string> = {
  success: '#dcfce7',
  error:   '#fee2e2',
  info:    '#dbeafe',
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'i',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  function dismiss(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', left: '24px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex', flexDirection: 'column', gap: '8px',
        zIndex: 2000, alignItems: 'flex-start',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: '#fff',
            padding: '12px 14px',
            borderRadius: '12px',
            fontSize: '13px',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,.12)',
            border: '1px solid var(--border)',
            borderRight: `3px solid ${COLORS[t.type]}`,
            animation: 'fadeInUp .2s ease',
            minWidth: 220, maxWidth: 340,
          }}>
            <span aria-hidden="true" style={{
              width: 28, height: 28, borderRadius: '7px', flexShrink: 0,
              background: ICON_BG[t.type], color: COLORS[t.type],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700,
            }}>{ICONS[t.type]}</span>
            <span style={{ flex: 1, color: 'var(--text)' }}>{t.msg}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="סגור התראה"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1,
                padding: '2px 4px', borderRadius: '5px',
                transition: 'background .12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
