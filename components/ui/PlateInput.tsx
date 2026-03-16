'use client'

import { useState } from 'react'
import { usePlateSearch } from '@/lib/hooks/usePlateSearch'
import { VehicleData, MODULE_FIELDS } from '@/lib/utils/plateApi'

type Module = keyof typeof MODULE_FIELDS

const FIELD_LABELS: Record<keyof VehicleData, string> = {
  plate:     'לוחית',
  make:      'יצרן',
  model:     'דגם',
  year:      'שנה',
  color:     'צבע',
  fuel:      'דלק',
  engine:    'נפח מנוע',
  chassis:   'שילדה',
  seats:     'מושבים',
  test_date: 'טסט אחרון',
  ownership: 'בעלות',
}

interface Props {
  module: Module
  onFill: (data: Partial<VehicleData>) => void
}

export default function PlateInput({ module, onFill }: Props) {
  const [plate, setPlate] = useState('')
  const { loading, error, data, search } = usePlateSearch(module)

  const handleSearch = async () => {
    const result = await search(plate)
    if (result) onFill({ ...result, plate: plate.replace(/[-\s]/g, '') })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={plate}
            onChange={e => setPlate(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="מספר רכב..."
            maxLength={8}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '15px',
              fontWeight: 600,
              letterSpacing: '2px',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: '8px',
              fontFamily: 'inherit',
              outline: 'none',
              textAlign: 'center',
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || plate.length < 5}
          style={{
            padding: '8px 16px',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading || plate.length < 5 ? 'not-allowed' : 'pointer',
            opacity: loading || plate.length < 5 ? 0.6 : 1,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          {loading ? '⏳' : '🔍 משיכת פרטים'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)' }}>⚠️ {error}</span>
      )}

      {/* Filled fields preview */}
      {data && Object.keys(data).length > 0 && (
        <div style={{
          background: '#f0fdf6',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 16px',
        }}>
          {Object.entries(data).map(([key, val]) => (
            <span key={key} style={{ fontSize: '12px', color: '#15803d' }}>
              <strong>{FIELD_LABELS[key as keyof VehicleData]}:</strong> {String(val)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
