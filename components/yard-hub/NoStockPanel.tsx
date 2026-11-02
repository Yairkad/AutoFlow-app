'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import { parseTireSize, tireSizeSearchParams } from '@/lib/tires/size'
import SearchSheet, { ResultRow } from '@/components/yard/SearchSheet'
import type { SearchResult } from '@/app/api/yard/search/route'
import { Chips, Empty, Field, HubFrame, Sheet, api, fmtDate, inputCls, inputStyle } from './ui'

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

// Items charged on closed work cards that aren't linked to anything in the stock ("חייב ללא מלאי"
// / unknown barcode). Linked items just take the stock below zero, so they don't show here.
// The office links each line to a tire ("🔗 שייך" / new tire) — that takes it out of the stock.
// Grouped by item so "sold 4 × 205/55R16" is one line.
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

  // Link a line to a tire/product (or create the tire) — stock goes down, line leaves the list
  const [linkRow, setLinkRow] = useState<NoStockRow | null>(null)
  const [newTire, setNewTire] = useState<{ row: NoStockRow; brand: string; width: string; profile: string; rim: string; price: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(body: object, okMsg: string) {
    setBusy(true)
    try { await api('/api/yard/no-stock', 'POST', body); showToast(okMsg, 'success'); await load(); return true }
    catch (e) { showToast(`שגיאה: ${(e as Error).message}`, 'error'); return false }
    finally { setBusy(false) }
  }
  function openNewTire(r: NoStockRow) {
    const sz = parseTireSize(r.name)
    setNewTire({ row: r, brand: '', width: sz ? String(sz.width) : '', profile: sz ? String(sz.profile) : '', rim: sz ? String(sz.rim) : '', price: String(r.unit_price || '') })
  }
  async function saveNewTire() {
    if (!newTire) return
    const ok = await post({ action: 'create', id: newTire.row.id, tire: {
      brand: newTire.brand, width: Number(newTire.width) || undefined, profile: Number(newTire.profile) || undefined,
      rim: Number(newTire.rim) || undefined, sell_price: Number(newTire.price) || undefined } }, 'הצמיג נוצר והמלאי עודכן ✓')
    if (ok) setNewTire(null)
  }
  // Lines from before negative stock: linked, but the missing units never left the stock
  const legacy = (rows ?? []).filter(r => r.ref_id && !r.stock_resolved_at)

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
      subtitle="פריטים שחויבו בכרטיסים סגורים בלי קישור לפריט במלאי — 🔗 שייך לצמיג והמלאי יתעדכן">
      <Chips value={view} onChange={setView} options={[
        { value: 'open', label: 'לא סודר' },
        { value: 'all',  label: 'הכול' },
      ]} />

      {legacy.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl flex items-center gap-3 flex-wrap" style={{ padding: '12px 14px' }}>
          <p className="text-blue-900 text-sm font-semibold flex-1" style={{ minWidth: 200 }}>
            {legacy.length} שורות ישנות של צמיגים/מוצרים שקיימים במלאי ({legacy.reduce((s, r) => s + r.no_stock_qty, 0)} יח׳) — המלאי עצר אז ב-0. הורדה תוריד אותם מהמלאי (גם למינוס) ותסיר אותם מהרשימה.
          </p>
          <button disabled={busy} onClick={() => post({ action: 'apply_linked' }, 'המלאי עודכן ✓')}
            className="bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 14 }}>
            ⬇ הורד מהמלאי
          </button>
        </div>
      )}

      {linkRow && (
        <SearchSheet<SearchResult>
          title={`🔗 איזה ${linkRow.item_type === 'tire' ? 'צמיג' : 'מוצר'} זה? — ${linkRow.name}`}
          placeholder="מותג, שם או מקט..."
          sizeMode={linkRow.item_type === 'tire' ? 'toggle' : 'off'}
          initialQuery={linkRow.item_type === 'tire' ? (() => { const z = parseTireSize(linkRow.name); return z ? `${z.width}/${z.profile}/${z.rim}` : '' })() : ''}
          minChars={2}
          search={async (q, kind) => {
            const params = kind === 'size' ? tireSizeSearchParams(q) : `q=${encodeURIComponent(q)}`
            const res = await fetch(`/api/yard/search?${params}&type=${linkRow.item_type}&include_empty=1`)
            return res.ok ? res.json() : []
          }}
          getKey={r => r.id}
          renderItem={r => <ResultRow r={r} />}
          emptyText={() => 'לא נמצא — אפשר ליצור צמיג חדש למטה'}
          onPick={r => { const row = linkRow; setLinkRow(null); post({ action: 'link', id: row.id, ref_id: r.id }, `שויך ל-${r.name} · המלאי עודכן ✓`) }}
          footer={linkRow.item_type === 'tire' ? ({ closeThen }) => (
            <button onClick={() => { const row = linkRow; closeThen(() => { setLinkRow(null); openNewTire(row) }) }}
              className="w-full bg-white border-2 border-blue-500 text-blue-700 font-bold rounded-xl" style={{ padding: '12px', fontSize: 15 }}>
              ➕ הצמיג לא קיים במערכת — צור חדש
            </button>
          ) : undefined}
          onClose={() => setLinkRow(null)}
        />
      )}

      {newTire && (
        <Sheet title="➕ צמיג חדש במלאי" onClose={() => setNewTire(null)}>
          <p className="text-slate-500 text-sm">נוצר עם הכמות שנמכרה במינוס — הקליטה של הצמיג תאפס אותו. ברקוד אפשר לשייך בקליטה.</p>
          <Field label="מותג">
            <input className={inputCls} style={inputStyle} value={newTire.brand} onChange={e => setNewTire({ ...newTire, brand: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {(['width', 'profile', 'rim'] as const).map(k => (
              <Field key={k} label={k === 'width' ? 'רוחב' : k === 'profile' ? 'פרופיל' : 'אינץ׳'}>
                <input inputMode="numeric" className={inputCls} style={{ ...inputStyle, textAlign: 'center' }} value={newTire[k]}
                  onChange={e => setNewTire({ ...newTire, [k]: e.target.value.replace(/\D/g, '') })} />
              </Field>
            ))}
          </div>
          <Field label="מחיר מכירה">
            <input inputMode="decimal" className={inputCls} style={inputStyle} value={newTire.price} onChange={e => setNewTire({ ...newTire, price: e.target.value })} />
          </Field>
          <button disabled={busy || !newTire.width || !newTire.profile || !newTire.rim} onClick={saveNewTire}
            className="bg-green-600 text-white rounded-xl font-bold disabled:opacity-40" style={{ padding: '12px', fontSize: 16 }}>
            {busy ? 'שומר...' : '✓ צור והורד מהמלאי'}
          </button>
        </Sheet>
      )}

      {rows === null ? <Empty icon="⏳" text="טוען..." /> : groups.length === 0 ? (
        <Empty icon="✅" text={view === 'open' ? 'הכול מסודר — אין מכירות ללא מלאי' : 'אין רשומות'} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <div key={g.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0" style={{ padding: '12px 14px' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-slate-900" style={{ fontSize: 16, direction: 'ltr', overflowWrap: 'anywhere', minWidth: 0 }}>{g.key}</span>
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
                    <span className="text-slate-600 flex-1" style={{ minWidth: 140, overflowWrap: 'anywhere' }}>{r.name}{r.sku ? ` · ${r.sku}` : ''}</span>
                    <span className="font-bold text-orange-700">×{r.no_stock_qty}</span>
                    <span className="text-slate-500">₪{Number(r.unit_price).toLocaleString()}</span>
                    {r.stock_resolved_at ? (
                      <button onClick={() => resolve([r.id], false)} className="text-slate-500 font-semibold" style={{ fontSize: 12 }}>בטל</button>
                    ) : r.ref_id ? (
                      <span className="text-blue-700 font-semibold" style={{ fontSize: 12 }}>⬇ ממתין להורדה</span>
                    ) : (<>
                      <button disabled={busy} onClick={() => setLinkRow(r)} className="bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50" style={{ padding: '3px 10px', fontSize: 12 }}>🔗 שייך</button>
                      <button onClick={() => resolve([r.id])} title="סמן כמטופל בלי לשנות מלאי" className="text-slate-500 border border-slate-200 rounded-lg font-semibold" style={{ padding: '3px 8px', fontSize: 12 }}>✓ סודר</button>
                    </>)}
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
