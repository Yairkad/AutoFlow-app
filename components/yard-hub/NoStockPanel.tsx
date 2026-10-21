'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import { parseTireSize } from '@/lib/tires/size'
import { Chips, Empty, HubFrame, api, fmtDate } from './ui'

interface NoStockRow {
  id: string
  item_type: 'tire' | 'product'
  ref_id: string | null
  name: string
  sku: string | null
  quantity: number
  unit_price: number
  no_stock_qty: number
  stock_resolved_at: string | null
  created_at: string
  yard_sessions: { plate: string; closed_at: string | null }
}

type View = 'open' | 'all'

// Items charged on closed work cards beyond what the inventory had — the office sorts
// them out against the stock ("✓ סודר"). Grouped by item so "sold 4 × 205/55R16" is one line.
export default function NoStockPanel({ variant }: { variant: 'yard' | 'office' }) {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('open')
  const [rows, setRows] = useState<NoStockRow[] | null>(null)

  const load = useCallback(async () => {
    try { setRows(await api<NoStockRow[]>(`/api/yard/no-stock?status=${view}`)) }
    catch (e) { showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error'); setRows([]) }
  }, [view, showToast])

  useEffect(() => { load() }, [load])
  useLiveRefresh(load, 60_000)

  const groups = useMemo(() => {
    const m = new Map<string, NoStockRow[]>()
    for (const r of rows ?? []) {
      const size = r.item_type === 'tire' ? parseTireSize(r.name) : null
      const key = size ? `${size.width}/${size.profile}R${size.rim}` : r.name.replace(/\s*·\s*ללא מלאי$/, '')
      m.set(key, [...(m.get(key) ?? []), r])
    }
    return [...m.entries()].map(([key, items]) => ({
      key, items,
      isTire: items[0].item_type === 'tire',
      open: items.filter(i => !i.stock_resolved_at),
      units: items.filter(i => !i.stock_resolved_at).reduce((s, i) => s + i.no_stock_qty, 0),
    })).sort((a, b) => b.units - a.units)
  }, [rows])

  async function resolve(ids: string[], resolved = true) {
    const prev = rows
    setRows(r => view === 'open' && resolved
      ? (r ?? []).filter(x => !ids.includes(x.id))
      : (r ?? []).map(x => ids.includes(x.id) ? { ...x, stock_resolved_at: resolved ? new Date().toISOString() : null } : x))
    try { await api('/api/yard/no-stock', 'PATCH', { ids, resolved }); showToast(resolved ? 'סומן כסודר ✓' : 'הוחזר לרשימה', 'success') }
    catch (e) { setRows(prev); showToast(`שגיאה: ${(e as Error).message}`, 'error') }
  }

  return (
    <HubFrame variant={variant} title="📦 נמכר ללא מלאי"
      subtitle="פריטים שחויבו בכרטיסי עבודה סגורים מעבר למה שהיה רשום במלאי — לסדר מול המלאי">
      <Chips value={view} onChange={setView} options={[
        { value: 'open', label: 'לא סודר' },
        { value: 'all',  label: 'הכול' },
      ]} />

      {rows === null ? <Empty icon="⏳" text="טוען..." /> : groups.length === 0 ? (
        <Empty icon="✅" text={view === 'open' ? 'הכול מסודר — אין מכירות ללא מלאי' : 'אין רשומות'} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <div key={g.key} className="bg-white rounded-xl border-2 border-slate-200" style={{ padding: '10px 12px' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-slate-900" style={{ fontSize: 16, direction: 'ltr' }}>{g.key}</span>
                {g.units > 0 && (
                  <span className="bg-orange-100 text-orange-800 rounded-full font-bold" style={{ fontSize: 12, padding: '2px 9px' }}>
                    נמכרו {g.units} ללא מלאי
                  </span>
                )}
                <span className="flex-1" />
                {g.isTire && (
                  <a href={`/tires?q=${encodeURIComponent(g.key)}`} className="text-blue-700 font-bold" style={{ fontSize: 13 }}>פתח בצמיגים ←</a>
                )}
                {g.open.length > 1 && (
                  <button onClick={() => resolve(g.open.map(i => i.id))} className="bg-green-600 text-white rounded-lg font-bold" style={{ padding: '5px 10px', fontSize: 13 }}>
                    ✓ סודר הכול
                  </button>
                )}
              </div>
              <div className="flex flex-col mt-1">
                {g.items.map(r => (
                  <div key={r.id} className="flex items-center flex-wrap gap-x-2 gap-y-0.5 border-t border-slate-100" style={{ padding: '6px 0', fontSize: 13, opacity: r.stock_resolved_at ? 0.5 : 1 }}>
                    <span className="text-slate-500" style={{ width: 70 }}>{fmtDate(r.yard_sessions.closed_at ?? r.created_at)}</span>
                    <span className="font-bold text-slate-700" style={{ direction: 'ltr' }}>{r.yard_sessions.plate}</span>
                    <span className="text-slate-600 flex-1" style={{ minWidth: 140 }}>{r.name}{r.sku ? ` · ${r.sku}` : ''}</span>
                    <span className="font-bold text-orange-700">×{r.no_stock_qty}</span>
                    <span className="text-slate-500">₪{Number(r.unit_price).toLocaleString()}</span>
                    {r.stock_resolved_at ? (
                      <button onClick={() => resolve([r.id], false)} className="text-slate-500 font-semibold" style={{ fontSize: 12 }}>בטל</button>
                    ) : (
                      <button onClick={() => resolve([r.id])} className="bg-green-50 text-green-700 border border-green-200 rounded-lg font-bold" style={{ padding: '3px 8px', fontSize: 12 }}>✓ סודר</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </HubFrame>
  )
}
