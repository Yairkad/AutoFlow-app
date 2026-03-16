type Variant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange'

const COLORS: Record<Variant, { bg: string; color: string }> = {
  green:  { bg: '#dcfce7', color: '#16a34a' },
  red:    { bg: '#fee2e2', color: '#dc2626' },
  yellow: { bg: '#fef9c3', color: '#ca8a04' },
  blue:   { bg: '#dbeafe', color: '#2563eb' },
  gray:   { bg: '#f1f5f9', color: '#64748b' },
  orange: { bg: '#ffedd5', color: '#ea580c' },
}

interface Props {
  children: React.ReactNode
  variant?: Variant
}

export default function Badge({ children, variant = 'gray' }: Props) {
  const { bg, color } = COLORS[variant]
  return (
    <span style={{
      background: bg,
      color,
      fontSize: '12px',
      fontWeight: 600,
      padding: '2px 10px',
      borderRadius: '999px',
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
