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

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error:   '❌',
  info:    'ℹ️',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px',
        zIndex: 2000, alignItems: 'center',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: '#1e293b',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,.25)',
            borderRight: `4px solid ${COLORS[t.type]}`,
            animation: 'fadeInUp .2s ease',
            whiteSpace: 'nowrap',
          }}>
            <span>{ICONS[t.type]}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
