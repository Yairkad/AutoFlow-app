'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/lib/yard/types'
import TireKeyboard from '@/components/yard/TireKeyboard'

type TireResult = SearchResult & { size: string; brand: string }

// Accepts 165/65/15 → 165/65R15 so users don't need to type R
function normalizeTireSize(q: string): string {
  const full = q.trim().match(/^(\d+)\/(\d+)\/(\d+)$/)
  if (full) return `${full[1]}/${full[2]}R${full[3]}`
  const partial = q.trim().match(/^(\d+\/\d+)\/$/)
  if (partial) return `${partial[1]}R`
  return q
}

// Standalone stock check — not tied to any open vehicle session. Type a size,
// see if it's in stock, and if so at what price and where (shelf location).
// No add-to-cart / position picker here, on purpose — this is a lookup, not
// a way to add tires to a car.
export default function TireLookupClient() {
  const router = useRouter()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<TireResult[]>([])
  const [selected, setSelected] = useState<TireResult | null>(null)
  const [showKeyboard, setShowKeyboard] = useState(true)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return }
    const normalized = normalizeTireSize(q)
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(normalized)}&type=tire`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
    setSearched(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { search(query) }, 300)
    return () => clearTimeout(t)
  }, [query, search])

  function confirmSearch() {
    search(query)
    setShowKeyboard(false)
  }

  return (
    <div className="flex h-full" style={{ background: '#f0f4f8' }}>
      {showKeyboard && (
        <TireKeyboard
          side
          value={query}
          onChange={setQuery}
          onConfirm={confirmSearch}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <div className="bg-white border-[3px] border-blue-600 rounded-xl flex-shrink-0" style={{ margin: '14px 14px 0', padding: '14px 18px' }}>
          <div className="font-black text-slate-900 leading-tight" style={{ fontSize: '20px' }}>
            🔍 בדיקת מלאי צמיגים
          </div>
          <div className="text-sm font-semibold text-slate-400 mt-0.5">בדיקה בלבד — לא מוסיף לכרטיס רכב</div>
        </div>

        {/* Nav */}
        <div className="flex gap-2 flex-shrink-0" style={{ margin: '10px 14px 0' }}>
          <button onClick={() => router.push('/yard')}
            className="flex-1 bg-slate-800 text-white rounded-xl font-bold active:scale-[.97] transition-all"
            style={{ minHeight: '48px', fontSize: '15px' }}>
            🏠 חזור לרחבה הראשית
          </button>
        </div>

        {/* Search row */}
        <div className="flex items-center flex-shrink-0" style={{ gap: '10px', padding: '10px 14px 0' }}>
          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="none"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setShowKeyboard(true)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSearch() }}
              placeholder="165/65/15 או 165/65R15"
              className="w-full border-2 border-blue-500 rounded-xl text-base font-bold bg-white outline-none"
              style={{ padding: '10px 14px', letterSpacing: '1px', direction: 'ltr' }}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 0' }}>
          {results.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              {searched ? 'אין מלאי במידה הזו' : 'הקלד מידת צמיג לבדיקה'}
            </div>
          ) : (
            results.map((r, i) => (
              <div key={r.id} onClick={() => { setSelected(r); setShowKeyboard(false) }}
                className="flex items-center cursor-pointer transition-colors active:bg-blue-100"
                style={{
                  minHeight: '62px', padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
                  background: selected?.id === r.id ? '#dbeafe' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                }}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800" style={{ fontSize: '15px' }}>{r.name}</div>
                  <div className="text-slate-400 font-medium flex items-center" style={{ fontSize: '13px', marginTop: '2px', gap: '8px' }}>
                    {r.stock != null && <span>מלאי: {r.stock} יח׳</span>}
                    {r.location && <span>📍 {r.location}</span>}
                  </div>
                </div>
                <div className="font-black text-blue-600 flex-shrink-0" style={{ fontSize: '16px' }}>
                  {r.price.toLocaleString()}₪
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected detail — big, clear, touch-friendly */}
        <div className="flex-shrink-0" style={{ padding: '10px 14px 14px' }}>
          {selected ? (
            <div className="bg-white rounded-xl border-2 border-blue-500" style={{ padding: '14px 18px' }}>
              <div className="font-bold text-slate-900" style={{ fontSize: '16px' }}>{selected.name}</div>
              <div className="flex items-center justify-between" style={{ marginTop: '8px' }}>
                <div className="text-slate-600 font-semibold" style={{ fontSize: '14px' }}>
                  מלאי: {selected.stock ?? 0} יח׳
                  {selected.location && <span> · מיקום: {selected.location}</span>}
                </div>
                <div className="font-black text-blue-600" style={{ fontSize: '22px' }}>
                  {selected.price.toLocaleString()}₪
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400" style={{ fontSize: '13px' }}>בחרו תוצאה לפרטים מלאים</div>
          )}
        </div>

      </div>
    </div>
  )
}
