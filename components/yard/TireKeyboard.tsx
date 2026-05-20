'use client'

interface Props {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  disabled?: boolean
  side?: boolean
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['/', '0', 'R'],
]

export default function TireKeyboard({ value, onChange, onConfirm, disabled, side }: Props) {
  const grid = (
    <div className="grid grid-cols-3" style={{ gap: '5px', marginBottom: '5px' }}>
      {ROWS.flat().map(k => (
        <button
          key={k}
          onPointerDown={e => { e.preventDefault(); onChange(value + k) }}
          className="bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 active:bg-blue-50 active:border-blue-300 transition-colors"
          style={{ height: side ? '48px' : '42px', fontSize: k === 'R' ? '15px' : '20px' }}
        >
          {k}
        </button>
      ))}
    </div>
  )

  const actions = (
    <div className="flex" style={{ gap: '5px' }}>
      <button
        onPointerDown={e => { e.preventDefault(); onChange(value.slice(0, -1)) }}
        className="flex-1 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-500 active:bg-slate-200 transition-colors"
        style={{ height: side ? '48px' : '42px', fontSize: '20px' }}
      >
        ⌫
      </button>
      <button
        onPointerDown={e => { e.preventDefault(); onConfirm() }}
        disabled={disabled}
        className="flex-[2] bg-green-700 text-white rounded-xl font-bold disabled:opacity-40 active:bg-green-800 transition-colors"
        style={{ height: side ? '48px' : '42px', fontSize: '15px' }}
      >
        חפש
      </button>
    </div>
  )

  if (side) {
    return (
      <div
        className="bg-slate-100 border-l-2 border-slate-200 flex-shrink-0 flex flex-col justify-center"
        style={{ width: '158px', padding: '8px' }}
      >
        {grid}
        {actions}
      </div>
    )
  }

  return (
    <div className="bg-slate-100 border-t-2 border-slate-200 flex-shrink-0" style={{ padding: '5px 10px 7px' }}>
      {grid}
      {actions}
    </div>
  )
}
