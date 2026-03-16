interface Props {
  children: React.ReactNode
  accent?: string
  style?: React.CSSProperties
}

export default function Card({ children, accent, style }: Props) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      borderRight: accent ? `4px solid ${accent}` : undefined,
      boxShadow: 'var(--shadow)',
      padding: '20px',
      ...style,
    }}>
      {children}
    </div>
  )
}
