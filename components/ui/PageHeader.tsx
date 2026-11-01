import React from 'react'

interface Props {
  icon: React.ReactNode
  /** Kept for existing callers; the redesign shows the icon on a neutral tile instead */
  iconBg?: string
  iconShadow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
  marginBottom?: number
}

// Redesign: title + subtitle carry the hierarchy; the icon sits on a quiet tile in the brand tint
// (the old colored gradient bubbles per screen are gone). Icons drawn with stroke="#fff" are
// recolored to the brand through currentColor-like CSS (.ph-icon svg).
export default function PageHeader({ icon, title, subtitle, actions, marginBottom = 18 }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom, flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="ph-icon" aria-hidden="true" style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'var(--primary-soft)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)', letterSpacing: '-.01em' }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
