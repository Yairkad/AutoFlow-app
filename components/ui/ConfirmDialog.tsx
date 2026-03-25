'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import Button from './Button'

interface ConfirmOptions {
  msg: string
  icon?: string
  confirmLabel?: string
  variant?: 'danger' | 'primary'
}

interface ConfirmCtx {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmCtx>({ confirm: async () => false })

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: (v: boolean) => void
  } | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const close = (result: boolean) => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state?.open && (
        <div
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: '380px', width: '100%',
              boxShadow: '0 12px 40px rgba(0,0,0,.18)',
              overflow: 'hidden',
            }}
          >
            {/* body */}
            <div style={{ padding: '24px 24px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
                background: (state.options.variant ?? 'danger') === 'danger' ? '#fee2e2' : '#f0fdf9',
              }}>
                {state.options.icon ?? '🗑️'}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.55, paddingTop: '4px' }}>
                {state.options.msg}
              </p>
            </div>
            {/* footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              background: '#f8fafc',
              display: 'flex', gap: '8px', justifyContent: 'flex-end',
            }}>
              <Button variant="secondary" onClick={() => close(false)}>ביטול</Button>
              <Button
                variant={state.options.variant ?? 'danger'}
                onClick={() => close(true)}
              >
                {state.options.confirmLabel ?? 'מחק'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
