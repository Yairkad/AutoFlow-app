'use client'

import { useEffect, useRef, useState } from 'react'
import TireSizeInput, { parseTireSizeText, type TireSize } from '@/components/yard/TireSizeInput'

// Full-screen search for the yard terminal. The search box sits at the very top and
// the results fill the space down to the device keyboard, so on a phone you always
// see what you type and what was found. Uses the device's own keyboard only.

interface Props<T> {
  title?:        string
  /** Extra controls shown under the search box (e.g. an option checkbox) */
  extra?:        React.ReactNode
  placeholder:   string
  /** 'numeric' opens the phone's number pad; 'search' the normal keyboard */
  inputMode?:    'search' | 'numeric'
  /** Tire size as three boxes (width / profile / rim): 'only', or 'toggle' to switch with free text */
  sizeMode?:     'off' | 'only' | 'toggle'
  initialQuery?: string
  /** Characters before searching (0 = also search the empty query, e.g. browse all) */
  minChars?:     number
  /** kind 'size': q is "width/profile/rim" with empty parts allowed, e.g. "205//16" */
  search:        (q: string, kind: 'text' | 'size') => Promise<T[]>
  getKey:        (item: T) => string
  renderItem:    (item: T) => React.ReactNode
  emptyText?:    (q: string) => string
  /** Runs after the sheet has closed (so it may navigate) */
  onPick:        (item: T, query: string) => void
  onClose:       () => void
}

export default function SearchSheet<T>({
  title, extra, placeholder, inputMode = 'search', sizeMode = 'off', initialQuery = '', minChars = 1,
  search, getKey, renderItem, emptyText, onPick, onClose,
}: Props<T>) {
  const [useSize, setUseSize] = useState(sizeMode !== 'off')
  const [size, setSize]       = useState<TireSize>(() => parseTireSizeText(sizeMode !== 'off' ? initialQuery : ''))
  const [query, setQuery]     = useState(sizeMode !== 'off' ? '' : initialQuery)
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [vh, setVh]           = useState<number | null>(null)
  const [top, setTop]         = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const afterRef  = useRef<(() => void) | null>(null)
  const pushedRef = useRef(false)
  const searchRef = useRef(search)
  useEffect(() => { searchRef.current = search }, [search])

  // Size to the visible area above the device keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => { setVh(vv.height); setTop(vv.offsetTop) }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])

  // Android "back" closes the sheet instead of leaving the screen
  useEffect(() => {
    history.pushState({ yardSearchSheet: true }, '')
    pushedRef.current = true
    const onPop = () => {
      pushedRef.current = false
      onClose()
      const after = afterRef.current
      afterRef.current = null
      after?.()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sizeQuery = `${size.width}/${size.profile}/${size.rim}`
  const kind: 'text' | 'size' = useSize ? 'size' : 'text'
  const effective = useSize ? sizeQuery : query.trim()
  const tooShort = useSize ? !(size.width || size.profile || size.rim) : effective.length < minChars

  useEffect(() => {
    const q = effective
    if (tooShort) {
      const t = setTimeout(() => { setResults([]); setLoading(false) }, 0)
      return () => clearTimeout(t)
    }
    let cancelled = false
    const t = setTimeout(() => {
      setLoading(true)
      searchRef.current(q, kind)
        .then(r => { if (!cancelled) setResults(r) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [effective, kind, tooShort])

  function close(after?: () => void) {
    inputRef.current?.blur()
    afterRef.current = after ?? null
    if (pushedRef.current) history.back()   // popstate handler closes + runs `after`
    else { onClose(); after?.() }
  }

  function pick(item: T) {
    const q = effective
    close(() => onPick(item, q))
  }

  const q = effective

  return (
    <div className="fixed inset-x-0 flex flex-col bg-white" dir="rtl"
      style={{ top, height: vh ?? '100dvh', zIndex: 70 }}>
      {/* Search box — always at the top */}
      <div className="flex items-center gap-2 bg-slate-900 flex-shrink-0" style={{ padding: '8px 10px' }}>
        {useSize ? (
          <div className="flex-1 flex items-center justify-center">
            <TireSizeInput value={size} onChange={setSize} autoFocus onEnter={() => results[0] && pick(results[0])} />
          </div>
        ) : (
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            autoFocus
            type="text"   // not "search": the browser would add its own second clear button
            inputMode={inputMode === 'numeric' ? 'numeric' : 'search'}
            enterKeyHint="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }}
            placeholder={placeholder}
            aria-label={title ?? placeholder}
            className="w-full bg-white rounded-xl font-bold outline-none"
            style={{ padding: '11px 40px 11px 12px', fontSize: '17px', direction: inputMode === 'numeric' ? 'ltr' : 'rtl', textAlign: 'right' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="absolute text-slate-400 font-black"
              style={{ top: '50%', right: 8, transform: 'translateY(-50%)', fontSize: '18px', width: 28, height: 28 }}
              aria-label="נקה"
            >
              ⌫
            </button>
          )}
        </div>
        )}
        <button
          onClick={() => close()}
          className="bg-slate-700 active:bg-slate-600 text-white rounded-xl font-bold flex-shrink-0"
          style={{ padding: '0 12px', height: 44, fontSize: '15px' }}
        >
          ✕ ביטול
        </button>
      </div>
      {(title || sizeMode === 'toggle') && (
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 bg-slate-100 flex-shrink-0" style={{ padding: '5px 14px', gap: 8 }}>
          <span>{title}</span>
          {sizeMode === 'toggle' && (
            <button onClick={() => setUseSize(u => !u)} className="bg-white border border-slate-300 rounded-full text-slate-700" style={{ padding: '3px 10px' }}>
              {useSize ? 'חיפוש חופשי (מותג / מקט)' : 'חיפוש לפי מידה'}
            </button>
          )}
        </div>
      )}
      {extra && <div className="bg-slate-50 border-b border-slate-200 flex-shrink-0" style={{ padding: '8px 14px' }}>{extra}</div>}

      {/* Results — fill the space down to the keyboard */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {results.length === 0 ? (
          <div className="text-center text-slate-400" style={{ padding: '28px 16px', fontSize: '15px' }}>
            {loading ? 'מחפש...' : tooShort ? (useSize ? 'הקלד מידה: רוחב / פרופיל / קוטר' : 'התחל להקליד לחיפוש') : (emptyText?.(q) ?? 'לא נמצאו תוצאות')}
          </div>
        ) : results.map((r, i) => (
          <button
            key={getKey(r)}
            onClick={() => pick(r)}
            className="w-full text-right flex items-center active:bg-blue-100"
            style={{ minHeight: 60, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : '#fff' }}
          >
            {renderItem(r)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Standard result row for /api/yard/search items. */
export function ResultRow({ r, showType }: {
  r: { name: string; sku: string | null; price: number; stock: number | null; location?: string; type: string }
  showType?: boolean
}) {
  const typeLabel = r.type === 'tire' ? 'צמיג' : r.type === 'service' ? 'שירות' : 'מוצר'
  return (
    <>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 flex items-center flex-wrap" style={{ fontSize: '16px', gap: '6px' }}>
          {r.name}
          {showType && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">{typeLabel}</span>}
        </div>
        <div className="text-slate-500 flex items-center flex-wrap" style={{ fontSize: '13px', marginTop: '2px', gap: '8px' }}>
          {r.stock != null && (r.stock > 0
            ? <span>מלאי: {r.stock}</span>
            : <span className="bg-red-100 text-red-700 font-bold rounded-full" style={{ padding: '0 8px' }}>אזל</span>)}
          {r.location && <span>📍 {r.location}</span>}
          {r.sku && <span style={{ direction: 'ltr' }}>{r.sku}</span>}
        </div>
      </div>
      <div className="font-black text-blue-600 flex-shrink-0" style={{ fontSize: '17px', marginInlineStart: '10px' }}>
        {r.price.toLocaleString()}₪
      </div>
    </>
  )
}
