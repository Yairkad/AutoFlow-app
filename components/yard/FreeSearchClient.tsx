'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'
import type { SearchResult } from '@/lib/yard/types'
import HebrewNumKeyboard from '@/components/yard/HebrewNumKeyboard'
import CameraScanner from '@/components/yard/CameraScanner'
import TirePositionPicker from '@/components/yard/TirePositionPicker'
import type { TirePosition } from '@/lib/yard/types'

interface Props {
  session:    YardSession
  filterType: 'all' | 'tire' | 'product' | 'service'
}

const TYPE_LABEL: Record<string, string> = {
  tire: 'צמיג', product: 'מוצר', service: 'שירות', all: '',
}

export default function FreeSearchClient({ session, filterType }: Props) {
  const router   = useRouter()
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [qty,      setQty]      = useState(1)
  const [price,    setPrice]    = useState<number | null>(null)
  const [confirm,      setConfirm]      = useState<{ item: SearchResult; onYes: () => void } | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [confirmBusy,  setConfirmBusy]  = useState(false)

  const [scanMode,    setScanMode]    = useState(false)
  const [cameraOpen,  setCameraOpen]  = useState(false)
  const [scanBuffer,  setScanBuffer]  = useState('')
  const [pickerItem,  setPickerItem]  = useState<SearchResult | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const existingNames = new Set((session.yard_session_items ?? []).map(i => i.name))
  const title = filterType === 'all' ? 'כל המלאי' : 'אביזרים לרכב'

  const CACHE_KEY = `yard-search-${filterType}`
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  const search = useCallback(async (q: string) => {
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(q)}&type=${filterType}`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
    // Cache empty-query (full list) for instant load next time
    if (!q) {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {}
    }
  }, [filterType]) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  // Load defaults on mount — show cache instantly, then refresh
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) setResults(data)
      }
    } catch {}
    search('')
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!scanMode) return
    scanRef.current?.focus()
    setScanBuffer('')
  }, [scanMode])

  async function handleBarcode(code: string) {
    setScanMode(false)
    setCameraOpen(false)
    const res = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    if (!res.ok) { alert('לא נמצא פריט עם ברקוד זה'); return }
    const item: SearchResult = await res.json()
    if (item.type === 'tire') {
      setPickerItem(item)
    } else {
      setSelected(item)
      setPrice(item.price)
      setQuery(item.name)
    }
  }

  function submitTireWithPosition(positions: TirePosition[]) {
    if (!pickerItem) return
    setPickerItem(null)
    setSaving(true)
    const finalPrice = pickerItem.price
    try {
      sessionStorage.setItem(`yard-pending-${session.id}`, JSON.stringify({
        id: `pending-${Date.now()}`, session_id: session.id, tenant_id: '',
        item_type: 'tire', ref_id: pickerItem.id, name: pickerItem.name, sku: pickerItem.sku,
        quantity: 1, unit_price: finalPrice, original_price: pickerItem.price,
        price_modified: false, tire_position: positions[0] ?? null,
        created_at: new Date().toISOString(),
      }))
    } catch {}
    router.push(`/yard/${session.id}`)
    const posArr = positions.length > 0 ? positions : [null]
    posArr.forEach(pos => {
      fetch(`/api/yard/sessions/${session.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'tire', ref_id: pickerItem.id, name: pickerItem.name, sku: pickerItem.sku,
          quantity: 1, unit_price: finalPrice, original_price: pickerItem.price,
          price_modified: false, tire_position: pos,
        }),
      })
    })
  }

  async function addToCart() {
    if (!selected) return
    const isTire = selected.type === 'tire'
    if (!isTire && existingNames.has(selected.name)) {
      setConfirmBusy(false)
      setConfirm({ item: selected, onYes: () => doAdd() })
      return
    }
    doAdd()
  }

  function doAdd() {
    if (!selected) return
    setConfirm(null)
    setSaving(true)
    const finalPrice = price ?? selected.price
    // Store pending item so WorkCard shows it instantly on mount
    try {
      sessionStorage.setItem(`yard-pending-${session.id}`, JSON.stringify({
        id: `pending-${Date.now()}`, session_id: session.id, tenant_id: '',
        item_type: selected.type, ref_id: selected.id, name: selected.name, sku: selected.sku,
        quantity: qty, unit_price: finalPrice, original_price: selected.price,
        price_modified: finalPrice !== selected.price, created_at: new Date().toISOString(),
      }))
    } catch {}
    router.push(`/yard/${session.id}`)
    fetch(`/api/yard/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type:      selected.type,
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

  const typePill = (type: string) => {
    const cls = type === 'tire' ? 'bg-blue-100 text-blue-700'
              : type === 'service' ? 'bg-purple-100 text-purple-700'
              : 'bg-slate-100 text-slate-600'
    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{TYPE_LABEL[type]}</span>
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      {cameraOpen && <CameraScanner onScan={handleBarcode} onClose={() => setCameraOpen(false)} />}
      {pickerItem && <TirePositionPicker onConfirm={submitTireWithPosition} />}

      {/* Hidden input for physical scanner — only in DOM when active to prevent virtual keyboard */}
      {scanMode && (
        <input ref={scanRef} className="absolute opacity-0 w-0 h-0"
          tabIndex={-1} inputMode="none"
          value={scanBuffer} onChange={e => setScanBuffer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && scanBuffer) handleBarcode(scanBuffer) }} />
      )}

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
        <div className="text-sm font-semibold text-slate-400 mt-0.5">{title}</div>
      </div>

      {/* Nav */}
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

      {/* Scan buttons */}
      <div className="flex gap-2 flex-shrink-0" style={{ margin: '10px 14px 0' }}>
        <button onClick={() => setCameraOpen(true)}
          className="flex-1 bg-blue-600 text-white rounded-xl font-bold active:scale-[.97] transition-all flex items-center justify-center gap-2"
          style={{ minHeight: '44px', fontSize: '14px' }}>
          <svg viewBox="0 0 20 16" width="18" height="14" fill="white">
            <rect x="7" y="0" width="6" height="2" rx="1"/>
            <path d="M2 3h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
            <circle cx="10" cy="10" r="3" fill="none" stroke="white" strokeWidth="1.5"/>
          </svg>
          סרוק מצלמה
        </button>
        <button onClick={() => setScanMode(m => !m)}
          className={`flex-1 rounded-xl font-bold active:scale-[.97] transition-all flex items-center justify-center gap-2 ${scanMode ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
          style={{ minHeight: '44px', fontSize: '14px' }}>
          <svg viewBox="0 0 28 22" width="18" height="14" fill="currentColor">
            <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
            <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
            <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
            <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
          </svg>
          סורק חיצוני
        </button>
      </div>

      {/* External scanner overlay */}
      {scanMode && (
        <div className="bg-blue-600 text-white rounded-xl flex items-center justify-between flex-shrink-0"
          style={{ margin: '8px 14px 0', padding: '10px 16px' }}>
          <span className="font-semibold flex items-center gap-2">
            <svg viewBox="0 0 28 22" width="18" height="14" fill="white">
              <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
              <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
              <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
              <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
            </svg>
            ממתין לסריקה...
          </span>
          <button onClick={() => setScanMode(false)} className="bg-white/20 border border-white/40 rounded-lg text-sm font-bold" style={{ padding: '5px 10px' }}>ביטול</button>
        </div>
      )}

      {/* Query display + Quantity row */}
      <div className="flex items-center flex-shrink-0" style={{ gap: '10px', padding: '10px 14px 0' }}>
        <input
          type="text"
          inputMode="none"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(query) }}
          placeholder="חפש מוצר, צמיג, שירות..."
          className="flex-1 border-2 border-blue-500 rounded-xl text-base font-medium bg-white outline-none"
          style={{ padding: '10px 14px' }}
        />
        <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden bg-white flex-shrink-0">
          <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 text-xl font-bold text-blue-600 hover:bg-slate-50">−</button>
          <span className="w-9 text-center font-bold border-x-2 border-slate-200 h-10 flex items-center justify-center">{qty}</span>
          <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 text-xl font-bold text-blue-600 hover:bg-slate-50">+</button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 0' }}>
        {results.length === 0 ? (
          <div className="p-6 text-center text-slate-400">{query ? 'לא נמצאו תוצאות' : 'טוען...'}</div>
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
                  <div className="font-bold text-slate-800 flex items-center" style={{ fontSize: '15px', gap: '8px' }}>
                    {r.name} {typePill(r.type)}
                  </div>
                  {r.sku && (
                    <div className="text-slate-400 font-medium" style={{ fontSize: '12px', marginTop: '1px' }}>מק״ט: {r.sku}</div>
                  )}
                  {r.stock != null && (
                    <div className="text-slate-400 font-medium" style={{ fontSize: '13px', marginTop: '2px' }}>מלאי: {r.stock}</div>
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

      {/* Add button */}
      <div className="flex-shrink-0" style={{ padding: '10px 14px 0' }}>
        <button
          onClick={addToCart}
          disabled={!selected || saving}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-xl text-lg font-bold transition-colors"
          style={{ padding: '16px' }}
        >
          {saving ? '...' : selected ? `הוסף לסל — ${((price ?? selected.price) * qty).toLocaleString()}₪` : 'בחר פריט'}
        </button>
      </div>

      {/* Custom keyboard — pinned at bottom */}
      <HebrewNumKeyboard
        value={query}
        onChange={setQuery}
        onConfirm={() => search(query)}
      />

      {/* Duplicate confirm */}
      {confirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl text-center shadow-xl" style={{ width: '92%', maxWidth: '400px', padding: '36px 28px' }}>
            <div className="font-bold text-slate-900" style={{ fontSize: '20px', marginBottom: '10px' }}>{confirm.item.name}</div>
            <div className="text-slate-500" style={{ fontSize: '16px', marginBottom: '32px' }}>כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex" style={{ gap: '14px', padding: '0 12px' }}>
              <button onClick={() => setConfirm(null)}
                disabled={confirmBusy}
                className="flex-1 border-2 border-slate-200 rounded-xl font-semibold text-slate-500 active:scale-95 active:bg-slate-50 transition-all disabled:opacity-50"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                ביטול
              </button>
              <button onClick={() => { setConfirmBusy(true); confirm.onYes() }}
                disabled={confirmBusy}
                className="flex-1 bg-green-700 text-white rounded-xl font-bold active:scale-95 active:bg-green-800 transition-all disabled:opacity-60"
                style={{ padding: '18px 12px', fontSize: '16px', minHeight: '60px' }}>
                {confirmBusy ? '⏳' : 'כן, הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
