'use client'

import { useEffect, useState } from 'react'
import { rangeParams, type QuickReport, type RangeKey } from '@/lib/yard/reports'
import { Chips, Empty, HubFrame, api, inputCls, inputStyle, todayISO } from './ui'

const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 flex flex-col" style={{ padding: '14px 16px', borderTop: `4px solid ${color}` }}>
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="font-black text-slate-900" style={{ fontSize: '28px', lineHeight: 1.2 }}>{value}</span>
      {sub && <span className="text-xs text-slate-500 mt-0.5">{sub}</span>}
    </div>
  )
}

function TopList({ title, rows }: { title: string; rows: { label: string; qty: number }[] }) {
  if (rows.length === 0) return null
  const max = rows[0].qty
  return (
    <div className="bg-white rounded-2xl border border-slate-200" style={{ padding: '14px 16px' }}>
      <p className="font-bold text-slate-700 mb-2">{title}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm" style={{ width: 120, direction: 'ltr', textAlign: 'right', flexShrink: 0 }}>{r.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height: 10 }}>
              <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(r.qty / max) * 100}%` }} />
            </div>
            <span className="font-black text-slate-700 text-sm" style={{ width: 32, textAlign: 'left' }}>{r.qty}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function QuickReportsPanel({ variant }: { variant: 'yard' | 'office' }) {
  const [range, setRange] = useState<RangeKey>('today')
  const [from, setFrom]   = useState(todayISO())
  const [to, setTo]       = useState(todayISO())
  // Results are tagged with the query they answer, so a stale one is never shown as current
  const [result, setResult] = useState<{ q: string; data?: QuickReport; error?: string } | null>(null)

  const valid = range !== 'custom' || (!!from && !!to && from <= to)
  const query = valid ? new URLSearchParams(rangeParams(range, from, to)).toString() : ''

  useEffect(() => {
    if (!query) return
    let cancelled = false
    api<QuickReport>(`/api/yard/reports?${query}`)
      .then(d => { if (!cancelled) setResult({ q: query, data: d }) })
      .catch(e => { if (!cancelled) setResult({ q: query, error: (e as Error).message }) })
    return () => { cancelled = true }
  }, [query])

  const current = result?.q === query ? result : null
  const data  = current?.data ?? null
  const error = current?.error ?? null

  const money = data?.canMoney
  const s = data?.sold

  return (
    <HubFrame variant={variant} title="📊 דוחות מהירים" subtitle="מה נמכר ומה נקלט למלאי בתקופה שבוחרים">
      <Chips value={range} onChange={setRange} options={[
        { value: 'today', label: 'היום' },
        { value: 'week',  label: 'השבוע' },
        { value: 'month', label: 'החודש' },
        { value: 'custom', label: 'טווח תאריכים' },
      ]} />
      {range === 'custom' && (
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 170 }} />
          <span className="text-slate-500">עד</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 170 }} />
        </div>
      )}

      {error ? <Empty icon="⚠️" text={`שגיאה: ${error}`} /> : !data || !s ? <Empty icon="⏳" text="טוען..." /> : (<>
        <p className="font-black text-slate-700" style={{ fontSize: '17px' }}>🛒 מכרנו (כרטיסי עבודה שנסגרו)</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          <Stat label="רכבים" value={String(s.cars)} color="#0f172a" sub={money ? `סה״כ ${ils(s.total)}` : undefined} />
          <Stat label="צמיגים" value={String(s.byType.tire.qty)} color="#2563eb" sub={money ? ils(s.byType.tire.amount) : undefined} />
          <Stat label="מוצרים" value={String(s.byType.product.qty)} color="#ea580c" sub={money ? ils(s.byType.product.amount) : undefined} />
          <Stat label="שירותים" value={String(s.byType.service.qty)} color="#16a34a" sub={money ? ils(s.byType.service.amount) : undefined} />
        </div>

        <p className="font-black text-slate-700 mt-2" style={{ fontSize: '17px' }}>📦 קיבלנו (קליטות מלאי)</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          <Stat label="צמיגים שנקלטו" value={String(data.received.tires)} color="#7c3aed" />
          <Stat label="מוצרים שנקלטו" value={String(data.received.products)} color="#db2777" />
          {money && <Stat label="שווי קליטה (עלות)" value={ils(data.received.cost)} color="#0891b2" />}
        </div>

        <div className="grid gap-3 mt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          <TopList title="המידות שנמכרו הכי הרבה" rows={s.topTires} />
          <TopList title="המידות שנקלטו הכי הרבה" rows={data.received.topTires} />
        </div>
      </>)}
    </HubFrame>
  )
}
