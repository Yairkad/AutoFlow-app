'use client'

import { useEffect, useRef } from 'react'

// Tire size typed like a date field: three boxes — width (3) / profile (2) R rim (2).
// The cursor jumps to the next box when one is full, Backspace in an empty box goes
// back, and pasting a whole size ("205/55R16", "2055516") fills all three.

export interface TireSize { width: string; profile: string; rim: string }

export const EMPTY_SIZE: TireSize = { width: '', profile: '', rim: '' }

const LEN: Record<keyof TireSize, number> = { width: 3, profile: 2, rim: 2 }
const ORDER: (keyof TireSize)[] = ['width', 'profile', 'rim']
const LABEL: Record<keyof TireSize, string> = { width: 'רוחב', profile: 'פרופיל', rim: 'קוטר' }

/** "205/55R16", "205 55 16", "2055516", "205/55" → segments */
export function parseTireSizeText(text: string): TireSize {
  const groups = text.match(/\d+/g) ?? []
  if (groups.length === 1 && groups[0].length > 3) {
    const d = groups[0]
    return { width: d.slice(0, 3), profile: d.slice(3, 5), rim: d.slice(5, 7) }
  }
  return { width: (groups[0] ?? '').slice(0, 3), profile: (groups[1] ?? '').slice(0, 2), rim: (groups[2] ?? '').slice(0, 2) }
}

export default function TireSizeInput({ value, onChange, autoFocus, onEnter }: {
  value: TireSize
  onChange: (v: TireSize) => void
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const refs = {
    width:   useRef<HTMLInputElement>(null),
    profile: useRef<HTMLInputElement>(null),
    rim:     useRef<HTMLInputElement>(null),
  }

  useEffect(() => {
    if (!autoFocus) return
    const first = ORDER.find(k => value[k].length < LEN[k]) ?? 'rim'
    refs[first].current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(key: keyof TireSize, raw: string) {
    const digits = raw.replace(/\D/g, '')
    // A whole size typed/pasted into the first box → spread over all three
    if (key === 'width' && (digits.length > 3 || /[/rR\s]/.test(raw))) {
      const parsed = parseTireSizeText(raw)
      onChange(parsed)
      const next = ORDER.find(k => parsed[k].length < LEN[k])
      if (next) refs[next].current?.focus()
      return
    }
    const d = digits.slice(0, LEN[key])
    onChange({ ...value, [key]: d })
    if (d.length === LEN[key]) {
      const idx = ORDER.indexOf(key)
      if (idx < 2) { const n = refs[ORDER[idx + 1]].current; n?.focus(); n?.select() }
    }
  }

  function keyDown(key: keyof TireSize, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { onEnter?.(); return }
    if (e.key === 'Backspace' && value[key] === '') {
      const idx = ORDER.indexOf(key)
      if (idx > 0) {
        e.preventDefault()
        const prevKey = ORDER[idx - 1]
        onChange({ ...value, [prevKey]: value[prevKey].slice(0, -1) })
        refs[prevKey].current?.focus()
      }
    }
  }

  const box = (key: keyof TireSize) => (
    <div className="flex flex-col items-center" style={{ gap: 2 }}>
      <input
        ref={refs[key]}
        value={value[key]}
        onChange={e => set(key, e.target.value)}
        onKeyDown={e => keyDown(key, e)}
        onFocus={e => e.currentTarget.select()}
        inputMode="numeric"
        enterKeyHint="search"
        maxLength={key === 'width' ? 9 : 7}
        aria-label={LABEL[key]}
        placeholder={'0'.repeat(LEN[key])}
        className="bg-white rounded-xl font-black text-center outline-none focus:ring-4 focus:ring-blue-400"
        style={{ width: key === 'width' ? 74 : 56, padding: '9px 4px', fontSize: '21px', letterSpacing: '1px', color: '#0f172a' }}
      />
      <span className="text-slate-300 font-semibold" style={{ fontSize: '10px' }}>{LABEL[key]}</span>
    </div>
  )

  return (
    <div className="flex items-start justify-center" dir="ltr" style={{ gap: 6 }}>
      {box('width')}
      <span className="text-white font-black" style={{ fontSize: '24px', lineHeight: '46px' }}>/</span>
      {box('profile')}
      <span className="text-white font-black" style={{ fontSize: '20px', lineHeight: '46px' }}>R</span>
      {box('rim')}
    </div>
  )
}
