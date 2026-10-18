'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession, SearchResult, TirePosition } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'
import TirePositionPicker from '@/components/yard/TirePositionPicker'
import { handOffToCard, occupiedPositions, tireIdsAt } from '@/lib/yard/handoff'
import SearchSheet, { ResultRow } from '@/components/yard/SearchSheet'
import { tireSizeSearchParams } from '@/lib/tires/size'

type TireResult = SearchResult & { size: string; brand: string }

interface Props { session: YardSession }


export default function TireSearchClient({ session }: Props) {
  const router       = useRouter()
  const scanRef      = useRef<HTMLInputElement>(null)
  const [scanMode,   setScanMode]    = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [sheetQuery,    setSheetQuery]    = useState<string | null>(null)   // null = search closed
  const [saving,        setSaving]        = useState(false)
  const selectedRef = useRef<TireResult | null>(null)
  const [detectedSize,  setDetectedSize]  = useState<string | null>(null)
  const [showPicker,    setShowPicker]    = useState(false)

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

  // q = "width/profile/rim" from the 3-box size field; each filled part filters
  const search = useCallback(async (q: string): Promise<TireResult[]> => {
    const cacheKey = `yard-tires-${q}`
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) return data
      }
    } catch {}
    const res  = await fetch(`/api/yard/search?type=tire&${tireSizeSearchParams(q)}`)
    const data = res.ok ? await res.json() : []
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })) } catch {}
    return data
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!scanMode) return
    setBarcodeInput('')
    setTimeout(() => scanRef.current?.focus(), 50)
  }, [scanMode])

  useEffect(() => {
    if (!scanMode || !barcodeInput.trim()) return
    const t = setTimeout(() => { handleBarcode(barcodeInput.trim()) }, 200)
    return () => clearTimeout(t)
  }, [barcodeInput, scanMode]) // eslint-disable-line

  async function handleBarcode(code: string) {
    setScanMode(false)
    const res = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const match = res.ok ? await res.json() : null
    if (match?.type === 'tire') {
      selectAndAdd(match as TireResult)
      return
    }
    setSheetQuery(code)
  }

  // Picking a tire goes straight to the position picker, then into the card
  function selectAndAdd(r: TireResult) {
    selectedRef.current = r
    setShowPicker(true)
  }

  function submitWithPosition(positions: TirePosition[], replace: TirePosition[]) {
    const item = selectedRef.current
    if (!item) return
    setShowPicker(false)
    setSaving(true)
    const posArr = positions.length > 0 ? positions : [null]
    handOffToCard(session.id, posArr.map(pos => ({
      item_type: 'tire', ref_id: item.id, name: item.name, sku: item.sku,
      quantity: 1, unit_price: item.price, original_price: item.price,
      price_modified: false, tire_position: pos,
    })), tireIdsAt(session, replace))
    router.push(`/yard/${session.id}`)
  }

  return (
    <div className="flex h-full" style={{ background: '#f0f4f8' }}>
      {showPicker && (
        <TirePositionPicker
          occupied={occupiedPositions(session)}
          onConfirm={submitWithPosition}
          onBack={() => setShowPicker(false)}
        />
      )}

      {sheetQuery !== null && (
        <SearchSheet<TireResult>
          title="חיפוש צמיג לפי מידה"
          placeholder="מידה"
          sizeMode="only"
          initialQuery={sheetQuery}
          search={search}
          getKey={r => r.id}
          renderItem={r => <ResultRow r={r} />}
          emptyText={() => 'אין צמיג במידה הזו במלאי'}
          onPick={r => selectAndAdd(r)}
          onClose={() => setSheetQuery(null)}
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
            /* Size search (opens the full-screen search) + scan button */
            <>
              <button onClick={() => setSheetQuery('')}
                className="flex-1 border-2 border-blue-500 rounded-xl bg-white text-right text-slate-400 font-bold flex items-center gap-2"
                style={{ padding: '12px 14px', fontSize: '16px' }}>
                🔍 חפש מידת צמיג...
              </button>
              <button onClick={() => setScanMode(true)}
                className="rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-800 transition-colors"
                style={{ width: '48px', height: '48px' }} aria-label="סורק ברקוד">
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
        {detectedSize && (
          <div className="flex-shrink-0" style={{ margin: '8px 14px 0' }}>
            <div className="bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between" style={{ padding: '10px 14px' }}>
              <span className="text-blue-800 text-sm font-semibold">זיהינו מידות מתאימות: <span className="font-black">{detectedSize}</span></span>
              <button onClick={() => setSheetQuery(detectedSize)}
                className="bg-blue-600 text-white text-sm font-bold rounded-lg active:scale-95 transition-all"
                style={{ padding: '5px 12px' }}>חפש</button>
            </div>
          </div>
        )}

        <div className="text-center text-slate-400" style={{ padding: '24px 16px', fontSize: '14px' }}>
          לוחצים על החיפוש ומקלידים מידה — בטלפון אפשר רק ספרות (2055516)
        </div>

        {saving && <div className="text-center text-slate-500 font-bold">מוסיף לכרטיס...</div>}
      </div>
    </div>
  )
}
