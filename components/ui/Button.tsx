'use client'

import { ButtonHTMLAttributes, useState } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--primary)', color: '#fff',             border: '1px solid var(--primary)' },
  secondary: { background: '#f1f5f9',        color: 'var(--text)',      border: '1px solid var(--border)'  },
  danger:    { background: 'var(--danger)',   color: '#fff',             border: '1px solid var(--danger)'  },
  outline:   { background: 'transparent',    color: 'var(--text)',      border: '1px solid var(--border)'  },
  ghost:     { background: 'transparent',    color: 'var(--text-muted)',border: '1px solid transparent'    },
}

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: '5px 12px',  fontSize: 12 },
  md: { padding: '8px 18px',  fontSize: 14 },
  lg: { padding: '11px 24px', fontSize: 15 },
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   Variant
  size?:      Size
  loading?:   boolean
  fullWidth?: boolean
}

export default function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  fullWidth = false,
  children,
  disabled,
  onClick,
  style,
  ...props
}: Props) {
  const [busy, setBusy] = useState(false)
  const [pressed, setPressed] = useState(false)

  const isDisabled = disabled || loading || busy

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isDisabled || !onClick) return
    const result = onClick(e) as unknown
    // Auto-detect async handlers
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      setBusy(true)
      try { await (result as Promise<unknown>) } finally { setBusy(false) }
    }
  }

  return (
    <button
      disabled={isDisabled}
      onClick={handleClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, borderRadius: 8, fontFamily: 'inherit', fontWeight: 500,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity .15s, transform .1s',
        opacity: isDisabled ? 0.55 : 1,
        transform: pressed && !isDisabled ? 'scale(0.96)' : 'scale(1)',
        width: fullWidth ? '100%' : undefined,
        ...VARIANTS[variant],
        ...SIZES[size],
        ...style,
      }}
      {...props}
    >
      {(loading || busy)
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Spinner /> שומר...
          </span>
        : children
      }
    </button>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 13, height: 13, border: '2px solid rgba(255,255,255,.4)',
      borderTopColor: 'currentColor', borderRadius: '50%',
      display: 'inline-block', animation: 'spin .6s linear infinite', flexShrink: 0,
    }} />
  )
}
