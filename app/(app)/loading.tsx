// Instant feedback while the next page loads (otherwise the old page stays frozen until the server answers)
export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="shimmer" style={{ height: '32px', width: '220px', borderRadius: '8px' }} />
      <div className="shimmer" style={{ height: '120px', borderRadius: '12px' }} />
      <div className="shimmer" style={{ height: '260px', borderRadius: '12px' }} />
    </div>
  )
}
