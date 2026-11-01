'use client'

import { useEffect, useState } from 'react'
import type { YardSession, YardSessionItem } from '@/lib/yard/types'
import type { SearchResult } from '@/app/api/yard/search/route'

// Edit a yard card's items in place (office): price, quantity, remove, add — without opening the
// yard terminal. Every change is saved right away; onChanged() reloads the card.
export default function SessionItemsEditor({ session, onChanged, onDone }: {
  session: YardSession
  onChanged: () => void
  onDone: () => void
}) {
  const items = session.yard_session_items ?? []
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [busy, setBusy]     = useState<string | null>(null)
  const [error, setError]   = useState('')
  const [q, setQ]           = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  const base = `/api/yard/sessions/${session.id}/items`

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key); setError('')
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
    setBusy(null)
    if (!res.ok) { setError('השמירה נכשלה — נסה שוב'); return false }
    onChanged()
    return true
  }

  const setQty = (it: YardSessionItem, qty: number) =>
    qty >= 1 && call(it.id, `${base}/${it.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: qty }) })

  async function savePrice(it: YardSessionItem) {
    const raw = prices[it.id]
    if (raw === undefined) return
    const price = Number(raw)
    if (!Number.isFinite(price) || price < 0) { setError('מחיר לא תקין'); return }
    if (price !== it.unit_price) await call(it.id, `${base}/${it.id}`, { method: 'PATCH', body: JSON.stringify({ unit_price: price }) })
    setPrices(p => { const n = { ...p }; delete n[it.id]; return n })
  }

  const remove = (it: YardSessionItem) => {
    if (!confirm(`להסיר את "${it.name}" מהכרטיס?`)) return
    call(it.id, `${base}/${it.id}`, { method: 'DELETE' })
  }

  // Search stock / services to add (same search the yard uses, out-of-stock included)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { const t = setTimeout(() => setResults([]), 0); return () => clearTimeout(t) }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/yard/search?q=${encodeURIComponent(term)}&type=all&include_empty=1`)
      setResults(res.ok ? (await res.json()).slice(0, 8) : [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function add(r: SearchResult) {
    const ok = await call('add', base, {
      method: 'POST',
      body: JSON.stringify({ item_type: r.type, ref_id: r.id, name: r.name, sku: r.sku, quantity: 1, unit_price: r.price,
        no_stock: r.type !== 'service' && (r.stock ?? 0) <= 0 }),
    })
    if (ok) { setQ(''); setResults([]) }
  }

  // Nothing matched: charge a free-text line (no stock item)
  async function addFree() {
    const name = q.trim()
    if (!name) return
    const ok = await call('add', base, { method: 'POST', body: JSON.stringify({ item_type: 'service', name, quantity: 1, unit_price: 0 }) })
    if (ok) { setQ(''); setResults([]) }
  }

  const cell = { padding: '8px 12px', fontSize: '14px' } as const
  return (
    <div style={{ borderTop: '1px solid #e2e8f0' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['תיאור', 'כמות', 'מחיר יח׳', 'סה״כ', ''].map(h => (
              <th key={h} className="text-right text-slate-400 font-bold" style={{ padding: '8px 12px', fontSize: '11px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: busy === it.id ? 0.5 : 1 }}>
              <td className="font-medium text-slate-800" style={cell}>
                {it.name}{it.tire_position ? <span className="text-slate-400 text-xs" style={{ marginRight: 6 }}>({it.tire_position})</span> : null}
              </td>
              <td style={cell}>
                <span className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button type="button" aria-label="פחות" disabled={busy !== null || it.quantity <= 1} onClick={() => setQty(it, it.quantity - 1)}
                    className="bg-slate-50 hover:bg-slate-100 disabled:opacity-40" style={{ width: 28, height: 30 }}>−</button>
                  <span className="font-bold text-center" style={{ minWidth: 28 }}>{it.quantity}</span>
                  <button type="button" aria-label="יותר" disabled={busy !== null} onClick={() => setQty(it, it.quantity + 1)}
                    className="bg-slate-50 hover:bg-slate-100 disabled:opacity-40" style={{ width: 28, height: 30 }}>+</button>
                </span>
              </td>
              <td style={cell}>
                <input type="number" min="0" step="0.01" aria-label={`מחיר ליחידה — ${it.name}`}
                  value={prices[it.id] ?? String(it.unit_price)}
                  onChange={e => setPrices(p => ({ ...p, [it.id]: e.target.value }))}
                  onBlur={() => savePrice(it)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="border border-slate-200 rounded-lg text-left" style={{ width: 90, height: 32, padding: '0 8px' }} />
              </td>
              <td className="font-bold text-slate-800" style={cell}>{(it.unit_price * it.quantity).toLocaleString()}₪</td>
              <td style={{ ...cell, textAlign: 'left' }}>
                <button type="button" onClick={() => remove(it)} disabled={busy !== null} aria-label={`הסר ${it.name}`}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-40" style={{ fontSize: 16, padding: 4 }}>✕</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="text-center text-slate-400" style={{ padding: 16 }}>אין פריטים בכרטיס</td></tr>
          )}
        </tbody>
      </table>

      {/* Add an item */}
      <div style={{ padding: '10px 12px', position: 'relative' }}>
        <div className="flex" style={{ gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="הוספת פריט"
            placeholder="הוסף פריט — מידת צמיג, מוצר או שירות"
            className="flex-1 border border-slate-200 rounded-lg" style={{ height: 36, padding: '0 10px' }} />
          <button type="button" onClick={onDone} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold" style={{ padding: '0 16px' }}>
            ✓ סיום עריכה
          </button>
        </div>
        {q.trim().length >= 2 && (
          <div className="absolute bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{ top: 50, right: 12, left: 12, zIndex: 20 }}>
            {results.map(r => (
              <button key={`${r.type}-${r.id}`} type="button" onClick={() => add(r)} disabled={busy !== null}
                className="w-full flex items-center justify-between hover:bg-slate-50 text-right" style={{ padding: '8px 12px', gap: 8 }}>
                <span>
                  <span className="font-semibold text-slate-800">{r.name}</span>
                  {r.type !== 'service' && <span className="text-slate-400 text-xs" style={{ marginRight: 6 }}>{(r.stock ?? 0) > 0 ? `מלאי ${r.stock}` : 'אזל'}</span>}
                </span>
                <span className="font-bold text-blue-700">{r.price.toLocaleString()}₪</span>
              </button>
            ))}
            <button type="button" onClick={addFree} disabled={busy !== null}
              className="w-full text-right hover:bg-slate-50 text-slate-600 border-t border-slate-100" style={{ padding: '8px 12px' }}>
              + הוסף &quot;{q.trim()}&quot; כפריט חופשי (מחיר יוזן בטבלה)
            </button>
          </div>
        )}
        {error && <div role="alert" className="text-red-600 text-sm" style={{ marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  )
}
