'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, SearchResult } from '@/lib/yard/types'
import { sessionDisplayName, formatPlate } from '@/lib/yard/types'

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
  const [showModal, setShowModal]   = useState(false)
  const [saving,    setSaving]      = useState(false)
  const [hints,     setHints]       = useState<string[]>([])

  // Search tires
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(q)}&type=tire`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  // Hint sizes from transport ministry
  useEffect(() => {
    if (!session.plate) return
    // Sizes from the plate's tire_size field (would come from plate lookup).
    // For now we show the session year as a hint prompt.
    setHints([])
  }, [session.plate])

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

  async function addToCart() {
    if (!selected) return
    setSaving(true)
    const finalPrice = price ?? selected.price
    await fetch(`/api/yard/sessions/${session.id}/items`, {
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
    setSaving(false)
    router.push(`/yard/${session.id}`)
  }

  const display = sessionDisplayName(session)

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
            <div className="grid grid-cols-[1fr_80px_90px] px-4 py-2 bg-slate-50 border-b text-xs font-bold text-slate-400 uppercase tracking-wide">
              <span>מוצר</span><span>מחיר</span><span></span>
            </div>
            {results.map(r => (
              <div
                key={r.id}
                onClick={() => { setSelected(r); setPrice(r.price) }}
                className={`grid grid-cols-[1fr_80px_90px] px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors
                  ${selected?.id === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div>
                  <div className="text-sm font-bold text-slate-800">{r.name}</div>
                  {r.stock != null && <div className="text-xs text-slate-400">מלאי: {r.stock} יח׳</div>}
                </div>
                <div className="text-sm font-bold text-blue-600 self-center">{r.price.toLocaleString()}₪</div>
                <button
                  onClick={e => { e.stopPropagation(); setSelected(r); setPrice(r.price); setShowModal(true) }}
                  className="text-xs text-slate-400 underline self-center text-center hover:text-amber-600"
                >שנה מחיר</button>
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

      {/* Price change modal */}
      {showModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-lg font-bold mb-4">שנה מחיר — {selected.name}</div>
            <input
              type="number"
              autoFocus
              value={price ?? ''}
              onChange={e => setPrice(Number(e.target.value))}
              className="w-full border-2 border-blue-500 rounded-xl px-4 py-3 text-2xl font-bold text-center mb-4 outline-none"
              placeholder="מחיר חדש ₪"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-500">ביטול</button>
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">אשר</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
