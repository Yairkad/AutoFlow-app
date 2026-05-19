interface Props {
  label: string
  value: string | number
  color?: 'green' | 'blue' | 'red' | 'orange' | 'purple'
}

const COLORS = {
  green:  { text: 'var(--primary)', bg: '#f0fdf4' },
  blue:   { text: 'var(--accent)',  bg: '#eff6ff'  },
  red:    { text: 'var(--danger)',  bg: '#fef2f2'  },
  orange: { text: 'var(--warning)', bg: '#fffbeb'  },
  purple: { text: '#7c3aed',        bg: '#f5f3ff'  },
}

export default function StatCard({ label, value, color = 'green' }: Props) {
  const { text, bg } = COLORS[color]
  return (
    <div style={{
      background: bg, borderRadius: 'var(--radius-md)',
      padding: '14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 900, color: text, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
    </div>
  )
}
