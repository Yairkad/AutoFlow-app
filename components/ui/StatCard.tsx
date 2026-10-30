interface Props {
  label: string
  value: string | number
  color?: 'green' | 'blue' | 'red' | 'orange' | 'purple'
}


// Redesign: a plain KPI tile — label above, number below. The color only tints the number for
// states that need attention (red / orange); 'green' and 'blue' read as normal text now.
export default function StatCard({ label, value, color = 'green' }: Props) {
  const tone = color === 'red' ? 'var(--danger)' : color === 'orange' ? 'var(--warning)' : 'var(--text)'
  return (
    <div className="kpi-tile" style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, color: tone, lineHeight: 1.25 }}>{value}</div>
    </div>
  )
}
