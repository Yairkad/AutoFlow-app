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
        <label style={{ fontSize: '13px', fontWeight: 500, color: error ? 'var(--danger)' : 'var(--text)' }}>
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
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: '8px',
            background: error ? '#fff5f5' : '#fff',
            color: 'var(--text)',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color .15s',
            ...style,
          }}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e => e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'}
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
        <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  )
})

export default Input
