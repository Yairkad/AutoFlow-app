'use client'

import { useEffect, useState } from 'react'
import { daysAgoLabel, type StockSummary } from '@/lib/yard/reports'
import { api } from './ui'

const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`

// Freshness colour: green ≤ 7 days, amber ≤ 30, red beyond / never
function freshColor(days: number | null): string {
  if (days === null) return '#dc2626'
  if (days <= 7) return '#16a34a'
  if (days <= 30) return '#d97706'
  return '#dc2626'
}

function Card({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 flex flex-col gap-1" style={{ padding: '14px 16px', borderTop: `4px solid ${color}` }}>
      <span className="text-sm font-bold text-slate-500">{title}</span>
      {children}
    </div>
  )
}

/** Office: tire stock value + how up to date the stock data is. */
export default function StockSummaryCards() {
  const [s, setS] = useState<StockSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api<StockSummary>('/api/yard/stock-summary').then(setS).catch(e => setErr((e as Error).message))
  }, [])

  if (err) return <div className="text-sm text-red-600">שגיאה בטעינת שווי מלאי: {err}</div>
  if (!s) return <div className="text-sm text-slate-400">טוען שווי מלאי...</div>

  const recv  = daysAgoLabel(s.lastReceiveDate)
  const count = daysAgoLabel(s.lastCountDate)

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <Card title="💰 שווי מלאי צמיגים (עלות)" color="#0f172a">
        <span className="font-black text-slate-900" style={{ fontSize: '26px' }}>{ils(s.costValue)}</span>
        <span className="text-xs text-slate-500">{s.tireCount.toLocaleString('he-IL')} צמיגים · {s.tireModels} דגמים</span>
        {s.missingCost > 0 && <span className="text-xs font-bold text-amber-700">⚠ {s.missingCost} דגמים בלי מחיר עלות — לא נספרו</span>}
      </Card>
      <Card title="🏷 שווי מלאי לפי מחיר מכירה" color="#2563eb">
        <span className="font-black text-slate-900" style={{ fontSize: '26px' }}>{ils(s.sellValue)}</span>
        {s.costValue > 0 && <span className="text-xs text-slate-500">רווח פוטנציאלי {ils(s.sellValue - s.costValue)}</span>}
      </Card>
      <Card title="📦 קליטת צמיגים אחרונה" color={freshColor(recv.days)}>
        <span className="font-black" style={{ fontSize: '24px', color: freshColor(recv.days) }}>{recv.text}</span>
        {s.lastReceiveDate && <span className="text-xs text-slate-500">{new Date(s.lastReceiveDate + 'T00:00:00').toLocaleDateString('he-IL')}</span>}
      </Card>
      <Card title="🔢 ספירת מלאי אחרונה" color={freshColor(count.days)}>
        <span className="font-black" style={{ fontSize: '24px', color: freshColor(count.days) }}>{count.text}</span>
        {s.lastCountDate && <span className="text-xs text-slate-500">{new Date(s.lastCountDate).toLocaleDateString('he-IL')}</span>}
      </Card>
    </div>
  )
}
