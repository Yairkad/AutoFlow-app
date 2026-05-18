'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { YardSession } from '@/lib/yard/types'
import { sessionDisplayName, formatPlate } from '@/lib/yard/types'
import type { SearchResult } from '@/lib/yard/types'

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
  const [modal,    setModal]    = useState(false)
  const [confirm,  setConfirm]  = useState<{ item: SearchResult; onYes: () => void } | null>(null)
  const [saving,   setSaving]   = useState(false)

  const existingNames = new Set((session.yard_session_items ?? []).map(i => i.name))
  const title = filterType === 'all' ? 'כל המלאי' : 'אביזרים לרכב'

  const search = useCallback(async (q: string) => {
    const res  = await fetch(`/api/yard/search?q=${encodeURIComponent(q)}&type=${filterType}`)
    const data = await res.json()
    setResults(data)
    setSelected(null)
  }, [filterType])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  // Load defaults on mount
  useEffect(() => { search('') }, [search])

  async function addToCart() {
    if (!selected) return
    const isTire = selected.type === 'tire'
    if (!isTire && existingNames.has(selected.name)) {
      setConfirm({ item: selected, onYes: () => doAdd() })
      return
    }
    doAdd()
  }

  async function doAdd() {
    if (!selected) return
    setConfirm(null)
    setSaving(true)
    const finalPrice = price ?? selected.price
    await fetch(`/api/yard/sessions/${session.id}/items`, {
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
    setSaving(false)
    router.push(`/yard/${session.id}`)
  }

  const display = sessionDisplayName(session)

  const typePill = (type: string) => {
    const cls = type === 'tire' ? 'bg-blue-100 text-blue-700'
              : type === 'service' ? 'bg-purple-100 text-purple-700'
              : 'bg-slate-100 text-slate-600'
    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{TYPE_LABEL[type]}</span>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b-4 border-red-500 px-4 py-3 flex-shrink-0">
        <div className="text-lg font-bold text-slate-800">{display} — {title}</div>
        <div className="text-xl font-black tracking-widest text-slate-900">{formatPlate(session.plate)}</div>
      </div>

      {/* Nav */}
      <div className="flex gap-2 px-3 pt-2 flex-shrink-0">
        <button onClick={() => router.push(`/yard/${session.id}`)}
          className="flex-1 bg-white border-2 border-slate-300 text-slate-700 rounded-xl py-3 text-sm font-bold active:scale-97">
          ← חזור לכרטיס עבודה
        </button>
        <button onClick={() => router.push('/yard')}
          className="flex-1 bg-slate-800 text-white rounded-xl py-3 text-sm font-bold active:scale-97">
          🏠 רחבה ראשית
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2 flex-shrink-0">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש מוצר, צמיג, שירות..."
          autoFocus
          className="w-full border-2 border-blue-500 rounded-xl px-4 py-3 text-base font-medium outline-none"
        />
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-3 px-3 pt-2 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-500">כמות:</span>
        <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
          <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-11 h-11 text-xl font-bold text-blue-600 hover:bg-slate-50">−</button>
          <span className="w-11 text-center text-lg font-bold border-x-2 border-slate-200 h-11 flex items-center justify-center">{qty}</span>
          <button onClick={() => setQty(q => q + 1)} className="w-11 h-11 text-xl font-bold text-blue-600 hover:bg-slate-50">+</button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto mx-3 mt-2 bg-white rounded-xl border border-slate-200">
        {results.length === 0 ? (
          <div className="p-6 text-center text-slate-400">{query ? 'לא נמצאו תוצאות' : 'הקלד לחיפוש'}</div>
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
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    {r.name} {typePill(r.type)}
                  </div>
                  {r.stock != null && <div className="text-xs text-slate-400">מלאי: {r.stock}</div>}
                </div>
                <div className="text-sm font-bold text-blue-600 self-center">{r.price.toLocaleString()}₪</div>
                <button
                  onClick={e => { e.stopPropagation(); setSelected(r); setPrice(r.price); setModal(true) }}
                  className="text-xs text-slate-400 underline self-center text-center hover:text-amber-600"
                >שנה מחיר</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add button */}
      <div className="px-3 py-3 flex-shrink-0">
        <button
          onClick={addToCart}
          disabled={!selected || saving}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-xl py-4 text-lg font-bold transition-colors"
        >
          {saving ? '...' : selected ? `הוסף לסל — ${((price ?? selected.price) * qty).toLocaleString()}₪` : 'בחר פריט'}
        </button>
      </div>

      {/* Price modal */}
      {modal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-lg font-bold mb-4">שנה מחיר — {selected.name}</div>
            <input type="number" autoFocus value={price ?? ''} onChange={e => setPrice(Number(e.target.value))}
              className="w-full border-2 border-blue-500 rounded-xl px-4 py-3 text-2xl font-bold text-center mb-4 outline-none" placeholder="מחיר חדש ₪" />
            <div className="flex gap-3">
              <button onClick={() => setModal(false)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-500">ביטול</button>
              <button onClick={() => setModal(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">אשר</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate confirm */}
      {confirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <div className="text-lg font-bold mb-1">{confirm.item.name}</div>
            <div className="text-slate-500 mb-5">כבר קיים בסל — להוסיף עוד?</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-500">ביטול</button>
              <button onClick={confirm.onYes} className="flex-1 py-3 bg-green-700 text-white rounded-xl font-bold">כן, הוסף</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
