export default function UnitToggle({ unit, onChange }: { unit: 'ils' | 'agorot'; onChange: (v: 'ils' | 'agorot') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
      {(['ils', 'agorot'] as const).map(v => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{
          padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: unit === v ? '#2563eb' : 'transparent',
          color: unit === v ? '#fff' : 'var(--text-muted)',
          fontWeight: unit === v ? 600 : 400,
        }}>
          {v === 'ils' ? '₪' : 'אג\''}
        </button>
      ))}
    </div>
  )
}
