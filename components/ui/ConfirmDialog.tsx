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
              borderRadius: 'var(--radius)',
              padding: '32px 28px',
              maxWidth: '360px', width: '100%',
              textAlign: 'center',
              boxShadow: '0 8px 40px rgba(0,0,0,.18)',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>
              {state.options.icon ?? '🗑️'}
            </div>
            <p style={{ fontSize: '15px', marginBottom: '24px', color: 'var(--text)' }}>
              {state.options.msg}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
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
