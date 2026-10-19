'use client'

import { useCallback, useState } from 'react'
import type { SearchResult } from '@/lib/yard/types'
import SearchSheet, { ResultRow } from '@/components/yard/SearchSheet'
import { tireSizeSearchParams } from '@/lib/tires/size'
import LocationBadge from '@/components/stock/LocationBadge'

type Mode = 'tire' | 'product'


// Standalone price/stock check — not tied to any open vehicle session. Tires by size,
// products by name / SKU / barcode; out-of-stock items are shown too (marked "אזל").
// Searching happens in the full-screen SearchSheet with the device keyboard.
export default function TireLookupClient() {
  const [mode, setMode]         = useState<Mode>('tire')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)

  const search = useCallback(async (q: string, kind: 'text' | 'size'): Promise<SearchResult[]> => {
    const params = kind === 'size' ? tireSizeSearchParams(q) : `q=${encodeURIComponent(q)}`
    const res  = await fetch(`/api/yard/search?${params}&type=${mode}&include_empty=1`)
    const data: SearchResult[] = res.ok ? await res.json() : []
    setResults(data)   // keep the list on the page after the sheet closes
    return data
  }, [mode])

  function switchMode(m: Mode) {
    if (m === mode) return
    setMode(m); setResults([]); setSelected(null); setLastQuery('')
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      {sheetOpen && (
        <SearchSheet<SearchResult>
          title={mode === 'tire' ? 'בדיקת צמיג לפי מידה' : 'בדיקת מוצר'}
          placeholder={mode === 'tire' ? 'מידה' : 'שם מוצר, מק״ט או ברקוד'}
          sizeMode={mode === 'tire' ? 'only' : 'off'}
          initialQuery={lastQuery}
          search={search}
          getKey={r => r.id}
          renderItem={r => <ResultRow r={r} />}
          emptyText={() => mode === 'tire' ? 'אין צמיג במידה הזו במערכת' : 'לא נמצא מוצר'}
          onPick={(r, q) => { setSelected(r); setLastQuery(q) }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Header + tires / products tabs */}
      <div className="bg-white border-[3px] border-blue-600 rounded-xl flex-shrink-0" style={{ margin: '14px 14px 0', padding: '12px 16px' }}>
        <div className="font-black text-slate-900 leading-tight" style={{ fontSize: '20px' }}>
          🔍 בדיקת מחיר / מלאי
        </div>
        <div className="text-sm font-semibold text-slate-400 mt-0.5">בדיקה בלבד — לא מוסיף לכרטיס רכב</div>
        <div className="flex gap-2" style={{ marginTop: '10px' }}>
          {([['tire', '🔘 צמיגים'], ['product', '📦 מוצרים']] as const).map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)}
              className={`flex-1 rounded-xl font-bold border-2 transition-colors ${mode === m ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              style={{ minHeight: '46px', fontSize: '16px' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search — opens the full-screen search */}
      <div className="flex-shrink-0" style={{ padding: '10px 14px 0' }}>
        <button onClick={() => setSheetOpen(true)}
          className="w-full border-2 border-blue-500 rounded-xl bg-white text-right font-bold flex items-center gap-2"
          style={{ padding: '12px 14px', fontSize: '16px', color: lastQuery ? '#0f172a' : '#94a3b8' }}>
          🔍 {(mode === 'tire' ? lastQuery.replace(/\/+$/, '').replace(/^\/+/, '') : lastQuery) || (mode === 'tire' ? 'חפש מידת צמיג...' : 'חפש מוצר או ברקוד...')}
        </button>
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="flex-shrink-0 bg-white rounded-xl border-2 border-blue-500" style={{ margin: '10px 14px 0', padding: '14px 18px' }}>
          <div className="font-bold text-slate-900" style={{ fontSize: '17px' }}>{selected.name}</div>
          <div className="flex items-center justify-between" style={{ marginTop: '8px' }}>
            <div className="text-slate-600 font-semibold" style={{ fontSize: '14px' }}>
              {(selected.stock ?? 0) > 0 ? `מלאי: ${selected.stock} יח׳` : 'אזל מהמלאי'}
              {selected.location && <> · <LocationBadge location={selected.location} size={14} /></>}
            </div>
            <div className="font-black text-blue-600" style={{ fontSize: '24px' }}>
              {selected.price.toLocaleString()}₪
            </div>
          </div>
        </div>
      )}

      {/* Last results */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 14px', minHeight: 0 }}>
        {results.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            {mode === 'tire' ? 'לחצו על החיפוש והקלידו מידה' : 'לחצו על החיפוש והקלידו שם מוצר או ברקוד'}
          </div>
        ) : results.map((r, i) => (
          <button key={r.id} onClick={() => setSelected(r)}
            className="w-full text-right flex items-center active:bg-blue-100"
            style={{
              minHeight: '62px', padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
              background: selected?.id === r.id ? '#dbeafe' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
            }}>
            <ResultRow r={r} />
          </button>
        ))}
      </div>
    </div>
  )
}
