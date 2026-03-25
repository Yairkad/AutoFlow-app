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
      <div aria-hidden="true" style={{
        width: 72, height: 72, borderRadius: '20px',
        background: 'linear-gradient(135deg, #f0fdf9, #dcfce7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '32px',
      }}>{icon}</div>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {subtitle && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '260px', lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  )
}
