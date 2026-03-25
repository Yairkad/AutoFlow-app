'use client'

import { ButtonHTMLAttributes, useState } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:   { background: '#f0fdf9', color: '#15803d', border: '1.5px solid #bbf7d0', fontWeight: 600 },
  secondary: { background: '#fff',    color: 'var(--text)',       border: '1.5px solid var(--border)'  },
  danger:    { background: '#fff0f0', color: '#dc2626',           border: '1.5px solid #fca5a5'        },
  outline:   { background: 'transparent', color: 'var(--text)',   border: '1.5px solid var(--border)'  },
  ghost:     { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent'  },
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
  const [hovered, setHovered] = useState(false)

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
      onMouseEnter={() => !isDisabled && setHovered(true)}
      onMouseLeave={() => { setPressed(false); setHovered(false) }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, borderRadius: 9, fontFamily: 'inherit', fontWeight: 500,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity .15s, transform .12s, box-shadow .15s',
        opacity: isDisabled ? 0.55 : 1,
        transform: pressed && !isDisabled
          ? 'scale(0.96) translateY(1px)'
          : hovered && !isDisabled
            ? 'translateY(-1px)'
            : 'scale(1) translateY(0)',
        boxShadow: pressed || isDisabled
          ? 'none'
          : hovered
            ? '0 4px 12px rgba(0,0,0,0.14)'
            : '0 1px 3px rgba(0,0,0,0.08)',
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
      width: 13, height: 13, border: '2px solid rgba(0,0,0,.12)',
      borderTopColor: 'currentColor', borderRadius: '50%',
      display: 'inline-block', animation: 'spin .6s linear infinite', flexShrink: 0,
    }} />
  )
}
