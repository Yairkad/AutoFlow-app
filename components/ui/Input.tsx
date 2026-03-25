'use client'

import { InputHTMLAttributes, forwardRef } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  prefix?: string
  suffix?: string
  required?: boolean
}

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, prefix, suffix, required, style, ...props }, ref
) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{ fontSize: '12px', fontWeight: 600, color: error ? 'var(--danger)' : '#374151' }}>
          {label}{required && <span style={{ color: 'var(--danger)', marginRight: 2 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span style={{
            position: 'absolute', right: '10px',
            fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none',
          }}>{prefix}</span>
        )}
        <input
          ref={ref}
          style={{
            width: '100%',
            padding: `8px ${prefix ? '32px' : '12px'} 8px ${suffix ? '32px' : '12px'}`,
            fontSize: '14px',
            border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: '9px',
            background: error ? '#fff5f5' : '#f8fafc',
            color: 'var(--text)',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color .15s',
            ...style,
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(26,158,92,.12)' }}
          onBlur={e => { e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'; e.target.style.background = error ? '#fff5f5' : '#f8fafc'; e.target.style.boxShadow = 'none' }}
          {...props}
        />
        {suffix && (
          <span style={{
            position: 'absolute', left: '10px',
            fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none',
          }}>{suffix}</span>
        )}
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--danger)' }}>⚠ {error}</span>
      )}
    </div>
  )
})

export default Input
