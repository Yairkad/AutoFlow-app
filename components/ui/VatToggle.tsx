export default function VatToggle({ mode, onChange }: { mode: 'before' | 'after'; onChange: (v: 'before' | 'after') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
      {(['after', 'before'] as const).map(v => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{
          padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: mode === v ? 'var(--primary)' : 'transparent',
          color: mode === v ? '#fff' : 'var(--text-muted)',
          fontWeight: mode === v ? 600 : 400,
        }}>
          {v === 'after' ? 'כולל מע"מ' : 'לפני מע"מ'}
        </button>
      ))}
    </div>
  )
}
