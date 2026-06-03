'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, SearchResult, TirePosition } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'
import TirePositionPicker from '@/components/yard/TirePositionPicker'
import TireKeyboard from '@/components/yard/TireKeyboard'

type TireResult = SearchResult & { size: string; brand: string }

interface Props { session: YardSession }

// Accepts 165/65/15 → 165/65R15 so users don't need to type R
function normalizeTireSize(q: string): string {
  const full = q.trim().match(/^(\d+)\/(\d+)\/(\d+)$/)
  if (full) return `${full[1]}/${full[2]}R${full[3]}`
  const partial = q.trim().match(/^(\d+\/\d+)\/$/)
  if (partial) return `${partial[1]}R`
  return q
}

export default function TireSearchClient({ session }: Props) {
  const router       = useRouter()
  const scanRef      = useRef<HTMLInputElement>(null)
  const [scanMode,   setScanMode]    = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [query,         setQuery]         = useState('')
  const [results,       setResults]       = useState<TireResult[]>([])
  const [selected,      setSelected]      = useState<TireResult | null>(null)
  const [price,         setPrice]         = useState<number | null>(null)
  const [saving,        setSaving]        = useState(false)
  const selectedRef = useRef<TireResult | null>(null)
  const [detectedSize,  setDetectedSize]  = useState<string | null>(null)
  const [showPicker,    setShowPicker]    = useState(false)
  const [showKeyboard,  setShowKeyboard]  = useState(true)

  const CACHE_TTL = 5 * 60 * 1000

  useEffect(() => {
    if (!session.plate) return
    const plate = session.plate.replace(/\D/g, '')
    if (plate.length < 7) return
    fetch(`/api/public/plate?plate=${encodeURIComponent(plate)}`)
      .then(r => r.json())
      .then(data => { if (data?.tireSize) setDetectedSize(data.tireSize) })
      .catch(() => {})
  }, []) // eslint-disable-line

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    const normalized = normalizeTireSize(q)
    const cacheKey = `yard-tires-${normalized}`
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) { setResults(data); setSelected(null) }
      }
    } catch {}
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(normalized)}&type=tire`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })) } catch {}
  }, []) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => { search(query) }, 300)
    return () => clearTimeout(t)
  }, [query, search])

  useEffect(() => {
    if (!scanMode) return
    setBarcodeInput('')
    setTimeout(() => scanRef.current?.focus(), 50)
  }, [scanMode])

  async function handleBarcode(code: string) {
    setScanMode(false)
    setQuery(code)
    const res = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const match = await res.json()
    if (match?.type === 'tire') {
      selectAndAdd(match as TireResult)
      return
    }
    await search(code)
  }

  function confirmSearch() {
    search(query)
    setShowKeyboard(false)
  }

  function selectAndAdd(r: TireResult) {
    selectedRef.current = r
    setSelected(r)
    setPrice(r.price)
    setShowKeyboard(false)
    setShowPicker(true)
  }

  function addToCart() {
    if (!selected || saving) return
    selectedRef.current = selected
    setShowPicker(true)
  }

  function submitWithPosition(positions: TirePosition[]) {
    const item = selectedRef.current ?? selected
    if (!item) return
    setShowPicker(false)
    setSaving(true)
    const finalPrice = price ?? item.price

    if (positions.length === 0) {
      try {
        sessionStorage.setItem(`yard-pending-${session.id}`, JSON.stringify({
          id: `pending-${Date.now()}`, session_id: session.id, tenant_id: '',
          item_type: 'tire', ref_id: item.id, name: item.name, sku: item.sku,
          quantity: 1, unit_price: finalPrice, original_price: item.price,
          price_modified: finalPrice !== item.price, tire_position: null,
          created_at: new Date().toISOString(),
        }))
      } catch {}
      router.push(`/yard/${session.id}`)
      fetch(`/api/yard/sessions/${session.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'tire', ref_id: item.id, name: item.name, sku: item.sku,
          quantity: 1, unit_price: finalPrice, original_price: item.price,
          price_modified: finalPrice !== item.price, tire_position: null,
        }),
      })
    } else {
      try {
        sessionStorage.setItem(`yard-pending-${session.id}`, JSON.stringify({
          id: `pending-${Date.now()}`, session_id: session.id, tenant_id: '',
          item_type: 'tire', ref_id: item.id, name: item.name, sku: item.sku,
          quantity: 1, unit_price: finalPrice, original_price: item.price,
          price_modified: finalPrice !== item.price, tire_position: positions[0],
          created_at: new Date().toISOString(),
        }))
      } catch {}
      router.push(`/yard/${session.id}`)
      positions.forEach(pos => {
        fetch(`/api/yard/sessions/${session.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: 'tire', ref_id: item.id, name: item.name, sku: item.sku,
            quantity: 1, unit_price: finalPrice, original_price: item.price,
            price_modified: finalPrice !== item.price, tire_position: pos,
          }),
        })
      })
    }
  }

  return (
    <div className="flex h-full" style={{ background: '#f0f4f8' }}>
      {showPicker && (
        <TirePositionPicker
          onConfirm={submitWithPosition}
          onBack={() => { setShowPicker(false); setShowKeyboard(true) }}
        />
      )}

      {/* Keyboard — left side panel, opens/closes horizontally */}
      {showKeyboard && !scanMode && (
        <TireKeyboard
          side
          value={query}
          onChange={v => { setQuery(v) }}
          onConfirm={confirmSearch}
        />
      )}

      {/* Main content — shrinks when keyboard is open */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Plate header */}
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

        {/* Nav */}
        <div className="flex gap-2 flex-shrink-0" style={{ margin: '10px 14px 0' }}>
          <button onClick={() => router.push(`/yard/${session.id}`)}
            className="flex-1 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-bold active:scale-[.97] transition-all"
            style={{ minHeight: '48px', fontSize: '15px' }}>
            ← חזור לכרטיס עבודה
          </button>
          <button onClick={() => router.push('/yard')}
            className="flex-1 bg-slate-800 text-white rounded-xl font-bold active:scale-[.97] transition-all"
            style={{ minHeight: '48px', fontSize: '15px' }}>
            🏠 רחבה ראשית
          </button>
        </div>

        {/* Search row */}
        <div className="flex items-center flex-shrink-0" style={{ gap: '10px', padding: '10px 14px 0' }}>
          {scanMode ? (
            /* Barcode input — visible, auto-focused, scanner types here */
            <>
              <div className="flex-1 relative">
                <input
                  ref={scanRef}
                  type="text"
                  inputMode="none"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) handleBarcode(v) } }}
                  placeholder="סרוק ברקוד..."
                  className="w-full border-2 border-blue-500 rounded-xl text-base font-bold bg-blue-50 outline-none"
                  style={{ padding: '10px 14px', letterSpacing: '2px', direction: 'ltr' }}
                />
              </div>
              <button
                onClick={() => setScanMode(false)}
                className="rounded-xl border-2 border-slate-300 font-bold text-slate-600 bg-white flex-shrink-0 active:bg-slate-100 transition-colors"
                style={{ padding: '0 14px', height: '44px', fontSize: '14px' }}
              >
                ביטול
              </button>
            </>
          ) : (
            /* Size input + scan button */
            <>
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
              <button onClick={() => setScanMode(true)}
                className="rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-800 transition-colors"
                style={{ width: '44px', height: '44px' }}>
                <svg viewBox="0 0 28 22" width="22" height="17" fill="white">
                  <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
                  <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
                  <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
                  <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Detected size suggestion */}
        {detectedSize && !query && (
          <div className="flex-shrink-0" style={{ margin: '8px 14px 0' }}>
            <div className="bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between" style={{ padding: '10px 14px' }}>
              <span className="text-blue-800 text-sm font-semibold">זיהינו מידות מתאימות: <span className="font-black">{detectedSize}</span></span>
              <button onClick={() => { setQuery(detectedSize); setShowKeyboard(false) }}
                className="bg-blue-600 text-white text-sm font-bold rounded-lg active:scale-95 transition-all"
                style={{ padding: '5px 12px' }}>חפש</button>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 0' }}>
          {results.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              {query ? 'לא נמצאו תוצאות' : 'הקלד מידת צמיג לחיפוש'}
            </div>
          ) : (
            <>
              {results.map((r, i) => (
                <div key={r.id} onClick={() => selectAndAdd(r)}
                  className="flex items-center cursor-pointer transition-colors active:bg-blue-100"
                  style={{
                    minHeight: '62px', padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
                    background: selected?.id === r.id ? '#dbeafe' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800" style={{ fontSize: '15px' }}>{r.name}</div>
                    {r.stock != null && (
                      <div className="text-slate-400 font-medium" style={{ fontSize: '13px', marginTop: '2px' }}>מלאי: {r.stock} יח׳</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="font-black text-blue-600" style={{ fontSize: '16px' }}>{r.price.toLocaleString()}₪</div>
                    <div className="text-xs font-semibold text-green-700 bg-green-50 rounded px-2 py-0.5">הוסף ←</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Confirm */}
        <div className="flex-shrink-0" style={{ padding: '10px 14px 14px' }}>
          <button onClick={addToCart} disabled={!selected || saving}
            className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-xl text-lg font-bold transition-colors"
            style={{ padding: '14px' }}>
            {saving ? '...' : selected ? `הוסף לסל — ${(price ?? selected.price).toLocaleString()}₪` : 'בחר צמיג'}
          </button>
        </div>

      </div>
    </div>
  )
}
