interface Props {
  icon?: string
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon = '📭', title, subtitle, action }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', gap: '12px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px' }} aria-hidden="true">{icon}</div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
      {subtitle && (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '280px' }}>
          {subtitle}
        </p>
      )}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  )
}
