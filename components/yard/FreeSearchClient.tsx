'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession } from '@/lib/yard/types'
import { formatPlate } from '@/lib/yard/types'
import type { SearchResult } from '@/lib/yard/types'
import SearchSheet, { ResultRow } from '@/components/yard/SearchSheet'
import TirePositionPicker from '@/components/yard/TirePositionPicker'
import NoStockChargeDialog, { type NoStockCharge } from '@/components/yard/NoStockChargeDialog'
import { handOffToCard, occupiedPositions, tireIdsAt } from '@/lib/yard/handoff'
import type { TirePosition } from '@/lib/yard/types'

interface Props {
  session:    YardSession
  filterType: 'all' | 'tire' | 'product' | 'service'
}

export default function FreeSearchClient({ session, filterType }: Props) {
  const router   = useRouter()
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [noStockFor, setNoStockFor] = useState<{ kind: 'tire' | 'product' | 'choose'; text: string; barcode: string | null } | null>(null)
  const [confirm,      setConfirm]      = useState<{ item: SearchResult; onYes: () => void } | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [confirmBusy,  setConfirmBusy]  = useState(false)

  const [scanMode,    setScanMode]    = useState(false)
  const [scanBuffer,  setScanBuffer]  = useState('')
  const [pickerItem,  setPickerItem]  = useState<SearchResult | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const existingNames = new Set((session.yard_session_items ?? []).map(i => i.name))
  const title = filterType === 'all' ? 'כל המלאי' : 'אביזרים לרכב'

  const CACHE_KEY = `yard-search-${filterType}`
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  const fetchResults = useCallback(async (q: string): Promise<SearchResult[]> => {
    // include_empty: out-of-stock items still show — they're charged "ללא מלאי"
    const res = await fetch(`/api/yard/search?q=${encodeURIComponent(q)}&type=${filterType}&include_empty=1`)
    return res.ok ? res.json() : []
  }, [filterType])

  // Full list (empty query) for browsing; cached for instant load next time
  const loadAll = useCallback(async () => {
    const data = await fetchResults('')
    setResults(data)
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {}
  }, [fetchResults]) // eslint-disable-line

  // Load defaults on mount — show cache instantly, then refresh
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL) setResults(data)
      }
    } catch {}
    loadAll()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!scanMode) return
    scanRef.current?.focus()
    setScanBuffer('')
  }, [scanMode])

  async function handleBarcode(code: string) {
    setScanMode(false)
    const res = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const item: SearchResult | null = res.ok ? await res.json() : null
    // Not in the system → charge it anyway; out of stock → pickItem flags it "ללא מלאי"
    if (!item) { setNoStockFor({ kind: 'choose', text: '', barcode: code }); return }
    pickItem(item)
  }

  // Free charge (not in the system): id '' = no ref_id, stock 0 = flagged "ללא מלאי"
  function chargeWithoutStock(c: NoStockCharge) {
    setNoStockFor(null)
    pickItem({ id: '', type: c.type, name: c.name, sku: c.sku, price: c.price, stock: 0 })
  }
  const isNoStock = (i: SearchResult) => i.type !== 'service' && (!i.id || (i.stock ?? 0) <= 0)

  // Picking from the search sheet / list adds straight to the card (qty 1; change it on the card).
  // Tires still ask for the position on the car.
  function pickItem(item: SearchResult) {
    if (item.type === 'tire') { setPickerItem(item); return }
    if (existingNames.has(item.name)) {
      setConfirmBusy(false)
      setConfirm({ item, onYes: () => doAdd(item) })
      return
    }
    doAdd(item)
  }

  function submitTireWithPosition(positions: TirePosition[], replace: TirePosition[]) {
    if (!pickerItem) return
    setPickerItem(null)
    setSaving(true)
    const posArr = positions.length > 0 ? positions : [null]
    handOffToCard(session.id, posArr.map(pos => ({
      item_type: 'tire', ref_id: pickerItem.id || null, name: pickerItem.name, sku: pickerItem.sku,
      quantity: 1, unit_price: pickerItem.price, original_price: pickerItem.price,
      price_modified: false, tire_position: pos, no_stock: isNoStock(pickerItem),
    })), tireIdsAt(session, replace))
    router.push(`/yard/${session.id}`)
  }

  function doAdd(item: SearchResult) {
    setConfirm(null)
    setSaving(true)
    handOffToCard(session.id, [{
      item_type: item.type, ref_id: item.id || null, name: item.name, sku: item.sku,
      quantity: 1, unit_price: item.price, original_price: item.price,
      price_modified: false, tire_position: null, no_stock: isNoStock(item),
    }])
    router.push(`/yard/${session.id}`)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      {sheetOpen && (
        <SearchSheet<SearchResult>
          title={title}
          placeholder="חפש מוצר, צמיג, שירות..."
          search={fetchResults}
          getKey={r => r.id}
          renderItem={r => <ResultRow r={r} showType={filterType === 'all'} />}
          onPick={pickItem}
          onClose={() => setSheetOpen(false)}
          footer={({ q, closeThen }) => q.trim().length >= 2 && (
            <button onClick={() => closeThen(() => setNoStockFor({ kind: filterType === 'tire' ? 'tire' : filterType === 'product' ? 'product' : 'choose', text: q.trim(), barcode: null }))}
              className="w-full bg-orange-600 text-white rounded-xl font-bold" style={{ padding: '12px', fontSize: 15 }}>
              ➕ חייב פריט ללא מלאי: {q.trim()}
            </button>
          )}
        />
      )}
      {noStockFor && (
        <NoStockChargeDialog kind={noStockFor.kind} initialText={noStockFor.text} barcode={noStockFor.barcode}
          onClose={() => setNoStockFor(null)} onConfirm={chargeWithoutStock} />
      )}
      {pickerItem && <TirePositionPicker occupied={occupiedPositions(session)} onConfirm={submitTireWithPosition} />}

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
          style={{ minHeight: '48px', fontSize: '15px' }}>
          ← חזור לכרטיס עבודה
        </button>
        {/* Camera scanning is hidden for now (CameraScanner is kept for later) */}
        <button onClick={() => setScanMode(m => !m)}
          className={`flex-1 rounded-xl font-bold active:scale-[.97] transition-all flex items-center justify-center gap-2 ${scanMode ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
          style={{ minHeight: '48px', fontSize: '14px' }}>
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

      {/* Search — opens the full-screen search with the device keyboard */}
      <div className="flex-shrink-0" style={{ padding: '10px 14px 0' }}>
        <button onClick={() => setSheetOpen(true)}
          className="w-full border-2 border-blue-500 rounded-xl bg-white text-right text-slate-400 font-medium flex items-center gap-2"
          style={{ padding: '12px 14px', fontSize: '16px' }}>
          🔍 חפש מוצר, צמיג, שירות...
        </button>
      </div>

      {/* Browse list — tap adds to the card */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200" style={{ margin: '10px 14px 14px', minHeight: 0 }}>
        {results.length === 0 ? (
          <div className="p-6 text-center text-slate-400">טוען...</div>
        ) : results.map((r, i) => (
          <button key={r.id} onClick={() => !saving && pickItem(r)} disabled={saving}
            className="w-full text-right flex items-center active:bg-blue-100"
            style={{ minHeight: '62px', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
            <ResultRow r={r} showType={filterType === 'all'} />
          </button>
        ))}
      </div>

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
