import React from 'react'

interface Props {
  icon: React.ReactNode
  iconBg: string        // e.g. 'linear-gradient(135deg,#1a9e5c,#4ade80)'
  iconShadow?: string   // e.g. '#1a9e5c44'
  title: string
  subtitle?: string
  actions?: React.ReactNode
  marginBottom?: number
}

export default function PageHeader({ icon, iconBg, iconShadow, title, subtitle, actions, marginBottom = 20 }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom, flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: iconShadow ? `0 3px 10px ${iconShadow}` : undefined,
        }}>
          {icon}
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle}</p>
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
