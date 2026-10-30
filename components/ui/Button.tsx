'use client'

import { ButtonHTMLAttributes, useState } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', fontWeight: 600 },
  secondary: { background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 },
  // Cancel / delete — red outline only; solid red is never used for a button
  danger:    { background: 'var(--bg-card)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 45%, var(--border))', fontWeight: 600 },
  outline:   { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 },
  ghost:     { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' },
  // Approve / pay / confirm — the only green button
  success:   { background: 'var(--success)', color: '#fff', border: '1px solid var(--success)', fontWeight: 600 },
}

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: '5px 11px',  fontSize: 12.5, minHeight: 30 },
  md: { padding: '7px 15px',  fontSize: 14, minHeight: 36 },
  lg: { padding: '10px 22px', fontSize: 15, minHeight: 44 },
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
        gap: 6, borderRadius: 8, fontFamily: 'inherit', fontWeight: 500,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity .15s, filter .15s, box-shadow .15s',
        opacity: isDisabled ? 0.55 : 1,
        // Quiet feedback: slight darken on hover, inset on press — no bouncing
        filter: hovered && !isDisabled ? 'brightness(0.96)' : undefined,
        boxShadow: pressed && !isDisabled ? 'inset 0 1px 2px rgba(0,0,0,.12)' : 'none',
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
