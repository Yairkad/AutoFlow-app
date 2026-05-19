'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, SearchResult } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'

// Re-use the same SearchResult type from the API
type TireResult = SearchResult & { size: string; brand: string }

interface Props { session: YardSession }

export default function TireSearchClient({ session }: Props) {
  const router      = useRouter()
  const scanRef     = useRef<HTMLInputElement>(null)
  const [scanMode,  setScanMode]    = useState(false)
  const [scanBuffer, setScanBuffer] = useState('')
  const [query,     setQuery]       = useState(session.year ? '' : '')
  const [results,   setResults]     = useState<TireResult[]>([])
  const [selected,  setSelected]    = useState<TireResult | null>(null)
  const [qty,       setQty]         = useState(1)
  const [price,     setPrice]       = useState<number | null>(null)
  const [saving,    setSaving]      = useState(false)

  const CACHE_TTL = 5 * 60 * 1000

  // Search tires — cache results by query for instant repeat lookups
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    const cacheKey = `yard-tires-${q.trim()}`
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) { setResults(data); setSelected(null) }
      }
    } catch {}
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(q)}&type=tire`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })) } catch {}
  }, []) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  // Scanner mode: focus hidden input, collect barcode keystrokes
  useEffect(() => {
    if (!scanMode) return
    scanRef.current?.focus()
    setScanBuffer('')
  }, [scanMode])

  async function handleBarcode(code: string) {
    setScanMode(false)
    setQuery(code)
    await search(code)
  }

  function addToCart() {
    if (!selected || saving) return
    setSaving(true)
    const finalPrice = price ?? selected.price
    // Store pending item so WorkCard shows it instantly on mount
    try {
      sessionStorage.setItem(`yard-pending-${session.id}`, JSON.stringify({
        id: `pending-${Date.now()}`, session_id: session.id, tenant_id: '',
        item_type: 'tire', ref_id: selected.id, name: selected.name, sku: selected.sku,
        quantity: qty, unit_price: finalPrice, original_price: selected.price,
        price_modified: finalPrice !== selected.price, created_at: new Date().toISOString(),
      }))
    } catch {}
    router.push(`/yard/${session.id}`)
    fetch(`/api/yard/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type:      'tire',
        ref_id:         selected.id,
        name:           selected.name,
        sku:            selected.sku,
        quantity:       qty,
        unit_price:     finalPrice,
        original_price: selected.price,
        price_modified: finalPrice !== selected.price,
      }),
    })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      {/* Plate header card */}
      <div className="bg-white border-[3px] border-red-500 rounded-xl flex-shrink-0" style={{ margin: '14px 14px 0', padding: '14px 18px' }}>
        {(session.make || session.model) && (
          <div className="text-lg font-bold text-slate-700 leading-tight">
            {[session.make, session.model].filter(Boolean).join(' ')}
            {session.year && <span className="text-slate-400 font-normal mr-1">· {session.year}</span>}
          </div>
        )}
        <div className="font-black text-slate-900 leading-tight" style={{ fontSize: '22px', letterSpacing: '2px' }}>
          {formatPlate(session.plate)}
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex gap-2 flex-shrink-0" style={{ margin: '10px 14px 0' }}>
        <button onClick={() => router.push(`/yard/${session.id}`)}
          className="flex-1 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-bold active:scale-[.97] hover:bg-slate-50 transition-all"
          style={{ minHeight: '52px', fontSize: '15px' }}>
          ← חזור לכרטיס עבודה
        </button>
        <button onClick={() => router.push('/yard')}
          className="flex-1 bg-slate-800 text-white rounded-xl font-bold active:scale-[.97] hover:bg-slate-700 transition-all"
          style={{ minHeight: '52px', fontSize: '15px' }}>
          🏠 רחבה ראשית
        </button>
      </div>

      {/* Scan active bar */}
      {scanMode && (
        <div className="bg-blue-600 text-white rounded-xl flex items-center justify-between flex-shrink-0"
          style={{ margin: '10px 14px 0', padding: '12px 16px' }}>
          <span className="font-semibold">📡 ממתין לסריקה...</span>
          <button onClick={() => setScanMode(false)} className="bg-white/20 border border-white/40 rounded-lg text-sm font-bold" style={{ padding: '6px 12px' }}>ביטול</button>
        </div>
      )}

      {/* Hidden scanner input */}
      <input
        ref={scanRef}
        className="absolute opacity-0 w-0 h-0"
        value={scanBuffer}
        onChange={e => setScanBuffer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && scanBuffer) handleBarcode(scanBuffer) }}
      />

      {/* Search + Quantity + Scanner row */}
      <div className="flex items-center flex-shrink-0" style={{ gap: '10px', padding: '10px 14px 0' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="מידת צמיג (לדוג׳ 195/55/16)"
          className="flex-1 border-2 border-blue-500 rounded-xl text-base font-medium outline-none"
          style={{ padding: '10px 14px' }}
        />
        <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden bg-white flex-shrink-0">
          <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 text-xl font-bold text-blue-600 hover:bg-slate-50">−</button>
          <span className="w-9 text-center font-bold border-x-2 border-slate-200 h-10 flex items-center justify-center">{qty}</span>
          <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 text-xl font-bold text-blue-600 hover:bg-slate-50">+</button>
        </div>
        <button
          onClick={() => setScanMode(m => !m)}
          className={`rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${scanMode ? 'bg-blue-600' : 'bg-slate-800'}`}
          style={{ width: '44px', height: '44px' }}
        >
          <svg viewBox="0 0 28 22" width="22" height="17" fill="white">
            <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
            <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
            <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
            <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
          </svg>
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 0' }}>
        {results.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            {query ? 'לא נמצאו תוצאות' : 'הקלד מידת צמיג לחיפוש'}
          </div>
        ) : (
          <>
            <div className="flex items-center border-b" style={{ padding: '8px 16px', background: '#f1f5f9' }}>
              <span className="flex-1 text-xs font-bold text-slate-400 uppercase tracking-wide">מוצר</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">מחיר</span>
            </div>
            {results.map((r, i) => (
              <div
                key={r.id}
                onClick={() => { setSelected(r); setPrice(r.price) }}
                className="flex items-center cursor-pointer transition-colors"
                style={{
                  minHeight: '62px',
                  padding: '10px 16px',
                  borderBottom: '1px solid #e2e8f0',
                  background: selected?.id === r.id ? '#dbeafe' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800" style={{ fontSize: '15px' }}>{r.name}</div>
                  {r.stock != null && (
                    <div className="text-slate-400 font-medium" style={{ fontSize: '13px', marginTop: '2px' }}>מלאי: {r.stock} יח׳</div>
                  )}
                </div>
                <div className="font-black text-blue-600 flex-shrink-0" style={{ fontSize: '16px' }}>
                  {r.price.toLocaleString()}₪
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Confirm button */}
      <div className="flex-shrink-0" style={{ padding: '10px 14px 14px' }}>
        <button
          onClick={addToCart}
          disabled={!selected || saving}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-xl text-lg font-bold transition-colors"
          style={{ padding: '16px' }}
        >
          {saving ? '...' : selected ? `הוסף לסל — ${(( price ?? selected.price) * qty).toLocaleString()}₪` : 'בחר צמיג'}
        </button>
      </div>

    </div>
  )
}
