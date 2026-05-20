'use client'

interface Props {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  disabled?: boolean
}

const HEB_ROWS = [
  ['א','ב','ג','ד','ה','ו','ז'],
  ['ח','ט','י','כ','ל','מ','נ'],
  ['ס','ע','פ','צ','ק','ר','ש','ת'],
]
const NUM_ROW = ['1','2','3','4','5','6','7','8','9','0']

export default function HebrewNumKeyboard({ value, onChange, onConfirm, disabled }: Props) {
  return (
    <div className="bg-slate-100 border-t-2 border-slate-200 flex-shrink-0" style={{ padding: '6px 8px 10px' }}>
      {HEB_ROWS.map((row, ri) => (
        <div key={ri} className="flex" style={{ gap: '4px', marginBottom: '4px' }}>
          {row.map(k => (
            <button
              key={k}
              onPointerDown={e => { e.preventDefault(); onChange(value + k) }}
              className="flex-1 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 active:bg-blue-50 active:border-blue-300 transition-colors"
              style={{ height: '44px', fontSize: '18px', minWidth: 0 }}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="flex" style={{ gap: '4px', marginBottom: '4px' }}>
        {NUM_ROW.map(k => (
          <button
            key={k}
            onPointerDown={e => { e.preventDefault(); onChange(value + k) }}
            className="flex-1 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-700 active:bg-blue-50 active:border-blue-300 transition-colors"
            style={{ height: '40px', fontSize: '16px', minWidth: 0 }}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex" style={{ gap: '6px' }}>
        <button
          onPointerDown={e => { e.preventDefault(); onChange(value + ' ') }}
          className="flex-[2] bg-white border-2 border-slate-200 rounded-lg font-semibold text-slate-500 active:bg-slate-200 transition-colors"
          style={{ height: '44px', fontSize: '13px' }}
        >
          רווח
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onChange(value.slice(0, -1)) }}
          className="flex-1 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-500 active:bg-slate-200 transition-colors"
          style={{ height: '44px', fontSize: '20px' }}
        >
          ⌫
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onConfirm() }}
          disabled={disabled}
          className="flex-[2] bg-green-700 text-white rounded-lg font-bold disabled:opacity-40 active:bg-green-800 transition-colors"
          style={{ height: '44px', fontSize: '14px' }}
        >
          חפש
        </button>
      </div>
    </div>
  )
}
