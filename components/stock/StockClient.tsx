'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import FilterBar from '@/components/ui/FilterBar'
import NoStockPanel from '@/components/yard-hub/NoStockPanel'
import QuickReportsPanel from '@/components/yard-hub/QuickReportsPanel'
import ScanClient from '@/components/scan/ScanClient'
import { fuzzyIncludes } from '@/lib/search/fuzzy'
import type { SearchResult } from '@/app/api/yard/search/route'

type Tab = 'scan' | 'moves' | 'nostock' | 'reports' | 'count'

interface Move {
  id: string
  kind: 'tire' | 'product'
  ref_id: string
  name: string
  qty: number
  type: 'sale' | 'order'
  source: string | null
  session_id: string | null
  note: string | null
  date: string
}

// How stock changes: purchases come in from supplier invoices ("מה הגיע?") or receiving,
// sales from closed yard cards, and anything else is a manual correction (e.g. once a month).
const SOURCE_LABEL = (m: Move) =>
  m.source === 'manual' ? 'עדכון ידני'
    : m.type === 'sale' ? 'מכירה בכרטיס רחבה'
    : m.source === 'invoice' ? 'חשבונית ספק' : 'קליטת סחורה'

const COUNT_OPTIONS = [
  { href: '/scan?count=1',          icon: '📷', title: 'ספירה בסריקה',      text: 'סורקים ברקודים של צמיגים ומוצרים — כל סריקה מוסיפה 1. בסוף מאשרים ומעדכנים מלאי.' },
  { href: '/tires/inventory-count', icon: '📋', title: 'ספירת צמיגים מלאה', text: 'ספירה של כל הצמיגים מול הרשימה, עם סיכום הפרשים לפני העדכון.' },
  { href: '/tires/storage',         icon: '🗄', title: 'ספירה לפי ארונות',  text: 'סופרים מדף אחרי מדף לפי מפת הארונות, ורואים מה נספר ומתי.' },
]

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const fmtDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const tireName = (t: { brand: string | null; width: number | null; profile: number | null; rim: number | null } | null) =>
  t ? [t.brand, t.width && t.profile && t.rim ? `${t.width}/${t.profile}R${t.rim}` : null].filter(Boolean).join(' ') : 'צמיג שנמחק'

export default function StockClient() {
  const sb = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const tenantId = profile?.tenantId

  const [tab, setTab]       = useState<Tab>('moves')
  // /stock-count?tab=scan (the old /scan page redirects here) — read once
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'scan' || t === 'moves' || t === 'nostock' || t === 'reports' || t === 'count') { const id = setTimeout(() => setTab(t), 0); return () => clearTimeout(id) }
  }, [])
  const [moves, setMoves]   = useState<Move[] | null>(null)
  const [from, setFrom]     = useState(monthStart)
  const [to, setTo]         = useState('')
  const [search, setSearch] = useState('')
  const [fType, setFType]   = useState<'' | 'sale' | 'order'>('')
  const [fKind, setFKind]   = useState<'' | 'tire' | 'product'>('')

  const load = useCallback(async () => {
    if (!tenantId) return
    const range = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T) => {
      let r = q.gte('sold_date', from || '2000-01-01')
      if (to) r = r.lte('sold_date', to)
      return r
    }
    const [t, p] = await Promise.all([
      range(sb.from('tire_sales').select('*, tires(brand, width, profile, rim)').eq('tenant_id', tenantId)).order('sold_date', { ascending: false }).limit(2000),
      range(sb.from('product_sales').select('*, products(name)').eq('tenant_id', tenantId)).order('sold_date', { ascending: false }).limit(2000),
    ])
    if (t.error || p.error) { showToast('שגיאה בטעינת תנועות', 'error'); setMoves([]); return }
    type Row = { id: string; qty: number; movement_type: 'sale' | 'order' | null; source?: string | null; session_id?: string | null; note?: string | null; sold_date: string; created_at: string }
    const list: Move[] = [
      ...(t.data as (Row & { tire_id: string; tires: Parameters<typeof tireName>[0] })[]).map(r => ({
        id: r.id, kind: 'tire' as const, ref_id: r.tire_id, name: tireName(r.tires), qty: Number(r.qty), type: r.movement_type ?? 'sale',
        source: r.source ?? null, session_id: r.session_id ?? null, note: r.note ?? null, date: r.sold_date,
      })),
      ...(p.data as (Row & { product_id: string; products: { name: string } | null })[]).map(r => ({
        id: r.id, kind: 'product' as const, ref_id: r.product_id, name: r.products?.name ?? 'מוצר שנמחק', qty: Number(r.qty), type: r.movement_type ?? 'sale',
        source: r.source ?? null, session_id: r.session_id ?? null, note: r.note ?? null, date: r.sold_date,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    setMoves(list)
  }, [sb, tenantId, from, to, showToast])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const shown = useMemo(() => (moves ?? []).filter(m =>
    (!fType || m.type === fType) && (!fKind || m.kind === fKind) && (!search.trim() || fuzzyIncludes(m.name, search))
  ), [moves, fType, fKind, search])
  const sums = useMemo(() => ({
    out: shown.filter(m => m.type === 'sale').reduce((s, m) => s + m.qty, 0),
    in:  shown.filter(m => m.type === 'order').reduce((s, m) => s + m.qty, 0),
  }), [shown])

  // ── Manual update ─────────────────────────────────────────────────────────
  const [manOpen, setManOpen] = useState(false)
  const [q, setQ]             = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [pick, setPick]       = useState<SearchResult | null>(null)
  const [manType, setManType] = useState<'sale' | 'order'>('sale')
  const [manQty, setManQty]   = useState('1')
  const [manDate, setManDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manNote, setManNote] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2 || pick) { const t = setTimeout(() => setResults([]), 0); return () => clearTimeout(t) }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/yard/search?q=${encodeURIComponent(term)}&type=all&include_empty=1`)
      const list: SearchResult[] = res.ok ? await res.json() : []
      setResults(list.filter(r => r.type !== 'service').slice(0, 8))
    }, 250)
    return () => clearTimeout(t)
  }, [q, pick])

  function openManual() {
    setQ(''); setPick(null); setResults([]); setManType('sale'); setManQty('1'); setManNote('')
    setManDate(new Date().toISOString().slice(0, 10)); setManOpen(true)
  }

  async function applyQty(kind: 'tire' | 'product', id: string, delta: number) {
    const table = kind === 'tire' ? 'tires' : 'products'
    const { data, error } = await sb.from(table).select('qty').eq('id', id).single()
    if (error) return error
    return (await sb.from(table).update({ qty: Math.max(0, Number(data.qty) + delta) }).eq('id', id)).error
  }

  async function saveManual() {
    const qty = Number(manQty)
    if (!pick || !tenantId || !(qty > 0)) return
    setSaving(true)
    const kind = pick.type as 'tire' | 'product'
    const [table, refCol] = kind === 'tire' ? ['tire_sales', 'tire_id'] : ['product_sales', 'product_id']
    const row = { tenant_id: tenantId, [refCol]: pick.id, qty, movement_type: manType, sold_date: manDate }
    let { error } = await sb.from(table).insert({ ...row, source: 'manual', note: manNote.trim() || null })
    if (error && /source|note|column/i.test(error.message)) ({ error } = await sb.from(table).insert(row))
    if (!error) error = await applyQty(kind, pick.id, manType === 'sale' ? -qty : qty) ?? null
    setSaving(false)
    if (error) { showToast(`שגיאה: ${error.message}`, 'error'); return }
    showToast('המלאי עודכן ✓', 'success')
    setManOpen(false); load()
  }

  async function removeManual(m: Move) {
    if (!confirm(`למחוק את העדכון הידני של "${m.name}" ולהחזיר את הכמות?`)) return
    const { error } = await sb.from(m.kind === 'tire' ? 'tire_sales' : 'product_sales').delete().eq('id', m.id)
    const err = error ?? await applyQty(m.kind, m.ref_id, m.type === 'sale' ? m.qty : -m.qty)
    if (err) { showToast(`שגיאה: ${err.message}`, 'error'); return }
    showToast('נמחק והכמות הוחזרה', 'success'); load()
  }

  const TABS: [Tab, string][] = [['scan', 'סריקת ברקוד'], ['moves', 'תנועות'], ['nostock', 'נמכר ללא מלאי'], ['reports', 'דוחות'], ['count', 'ספירת מלאי']]
  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderTop: '1px solid var(--border)' }

  return (
    <>
      <PageHeader icon={<span aria-hidden="true" style={{ fontSize: 20 }}>📦</span>} iconBg="linear-gradient(135deg,#0f172a,#334155)"
        title="מלאי" subtitle="תנועות, מכירות מהרחבה, ספירות ודוחות"
        actions={tab === 'moves' ? <Button onClick={openManual}>+ עדכון ידני</Button> : undefined} />

      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, background: '#f1f5f9', borderRadius: 11, overflowX: 'auto', width: 'fit-content', maxWidth: '100%' }}>
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, whiteSpace: 'nowrap',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: tab === t ? 600 : 400, boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'moves' && (
        <>
          <FilterBar storageKey="stock-moves" search={search} onSearch={setSearch} placeholder="חיפוש צמיג / מוצר..."
            chips={[
              ...(fType ? [{ key: 't', label: fType === 'sale' ? 'יציאות' : 'כניסות', onRemove: () => setFType('') }] : []),
              ...(fKind ? [{ key: 'k', label: fKind === 'tire' ? 'צמיגים' : 'מוצרים', onRemove: () => setFKind('') }] : []),
            ]}
            onClearAll={() => { setSearch(''); setFType(''); setFKind('') }}>
            <select className="form-input" aria-label="כיוון" value={fType} onChange={e => setFType(e.target.value as typeof fType)} style={{ width: 'auto', margin: 0 }}>
              <option value="">כניסות ויציאות</option><option value="order">כניסות (קניות)</option><option value="sale">יציאות (מכירות)</option>
            </select>
            <select className="form-input" aria-label="סוג פריט" value={fKind} onChange={e => setFKind(e.target.value as typeof fKind)} style={{ width: 'auto', margin: 0 }}>
              <option value="">צמיגים ומוצרים</option><option value="tire">צמיגים</option><option value="product">מוצרים</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              מתאריך <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', margin: 0 }} />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              עד <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', margin: 0 }} />
            </label>
          </FilterBar>

          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, flexWrap: 'wrap' }}>
            <span>מ-{fmtDate(from || '2000-01-01')}{to ? ` עד ${fmtDate(to)}` : ''}</span>
            <span>נכנסו: <b className="num" style={{ color: 'var(--text)' }}>{sums.in}</b></span>
            <span>יצאו: <b className="num" style={{ color: 'var(--text)' }}>{sums.out}</b></span>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-soft)' }}>
                {['תאריך', 'פריט', 'מקור', 'כמות', ''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {moves === null && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>טוען...</td></tr>}
                {moves !== null && shown.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>אין תנועות בטווח הזה</td></tr>}
                {shown.map(m => (
                  <tr key={`${m.kind}-${m.id}`}>
                    <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} className="num">{fmtDate(m.date)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {m.name}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginInlineStart: 6 }}>{m.kind === 'tire' ? 'צמיג' : 'מוצר'}</span>
                      {m.note && <div style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>{m.note}</div>}
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{SOURCE_LABEL(m)}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap', color: m.type === 'sale' ? 'var(--danger)' : 'var(--success)' }} className="num">
                      {m.type === 'sale' ? `−${m.qty}` : `+${m.qty}`}
                    </td>
                    <td style={{ ...td, textAlign: 'left', width: 40 }}>
                      {m.source === 'manual' && (
                        <button type="button" onClick={() => removeManual(m)} aria-label={`מחק עדכון ידני — ${m.name}`}
                          style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15 }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'scan' && <ScanClient embedded />}
      {tab === 'nostock' && <NoStockPanel variant="office" />}
      {tab === 'reports' && <QuickReportsPanel variant="office" />}

      {tab === 'count' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, maxWidth: 900 }}>
          {COUNT_OPTIONS.map(o => (
            <Link key={o.href} href={o.href} style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: 20, borderRadius: 14, textDecoration: 'none',
              background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'var(--shadow)',
            }}>
              <span aria-hidden="true" style={{ fontSize: 30 }}>{o.icon}</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{o.title}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.text}</span>
            </Link>
          ))}
        </div>
      )}

      <Modal open={manOpen} onClose={() => setManOpen(false)} title="עדכון מלאי ידני" maxWidth={480}
        footer={<>
          <Button variant="secondary" onClick={() => setManOpen(false)}>ביטול</Button>
          <Button onClick={saveManual} loading={saving} disabled={!pick || !(Number(manQty) > 0)}>שמור</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <label className="form-label" htmlFor="man-item">צמיג / מוצר</label>
            {pick ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <b style={{ flex: 1 }}>{pick.name}</b>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>במלאי: {pick.stock ?? 0}</span>
                <button type="button" onClick={() => { setPick(null); setQ('') }} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: 13 }}>החלף</button>
              </div>
            ) : (
              <>
                <input id="man-item" className="form-input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="מידה, שם מוצר או מק״ט" style={{ margin: 0 }} />
                {results.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 5, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                    {results.map(r => (
                      <button key={`${r.type}-${r.id}`} type="button" onClick={() => { setPick(r); setResults([]) }}
                        style={{ display: 'flex', width: '100%', gap: 8, padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
                        <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.type === 'tire' ? 'צמיג' : 'מוצר'} · מלאי {r.stock ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div role="group" aria-label="סוג עדכון" style={{ display: 'flex', gap: 6 }}>
            {([['sale', '− הוצאה מהמלאי (מכירה)'], ['order', '+ הוספה למלאי']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setManType(v)} aria-pressed={manType === v} style={{
                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                border: `1px solid ${manType === v ? 'var(--primary)' : 'var(--border)'}`,
                background: manType === v ? '#eff6ff' : '#fff', color: manType === v ? 'var(--primary)' : 'var(--text-muted)',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label" htmlFor="man-qty">כמות</label>
              <input id="man-qty" type="number" min="1" className="form-input" value={manQty} onChange={e => setManQty(e.target.value)} style={{ margin: 0 }} />
            </div>
            <div>
              <label className="form-label" htmlFor="man-date">תאריך</label>
              <input id="man-date" type="date" className="form-input" value={manDate} onChange={e => setManDate(e.target.value)} style={{ margin: 0 }} />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="man-note">הערה</label>
            <input id="man-note" className="form-input" value={manNote} onChange={e => setManNote(e.target.value)} placeholder="למשל: עדכון חודשי" style={{ margin: 0 }} />
          </div>
        </div>
      </Modal>
    </>
  )
}
