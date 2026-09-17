'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { buildForecast, ForecastResult } from '@/lib/reports/buildForecast'

const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDMY = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}` }

const SOURCE_LABEL: Record<string, string> = {
  scheduled: "צ'ק/העברה מתוזמנים",
  recurring_item: 'פריט חוזר',
  recurring_expense: 'הוצאה חוזרת',
}

const SEL: React.CSSProperties = {
  padding: '7px 10px', fontSize: '13px', border: '1.5px solid var(--border)',
  borderRadius: '8px', background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div>יתרה צפויה: {fmt(payload[0].value)}</div>
    </div>
  )
}

interface Props { tenantId: string }

export default function CashFlowForecastTab({ tenantId }: Props) {
  const supabase = useRef(createClient()).current
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(60)
  const [result, setResult] = useState<ForecastResult | null>(null)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    buildForecast(supabase, tenantId, horizon).then(res => { setResult(res); setLoading(false) })
  }, [supabase, tenantId, horizon])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  if (!result || result.anchorBalance == null) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
        אין עדיין יתרת בנק ידועה להתחיל ממנה. ייבאו דף בנק/אשראי עם עמודת "יתרה" ב-<b>התאמת בנק ← ייבוא</b> כדי להפעיל את התחזית.
      </div>
    )
  }

  const chartData = [
    { date: fmtDMY(result.anchorDate!), balance: result.anchorBalance },
    ...result.events.map(ev => ({ date: fmtDMY(ev.date), balance: ev.runningBalance })),
  ]
  const finalBalance = result.events.length ? result.events[result.events.length - 1].runningBalance : result.anchorBalance

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>יתרת פתיחה (מ-{result.anchorSourceName ?? 'דף בנק'}, {fmtDMY(result.anchorDate!)})</span>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>{fmt(result.anchorBalance)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>יתרה צפויה בעוד {horizon} ימים</span>
          <div style={{ fontSize: '18px', fontWeight: 800, color: finalBalance >= 0 ? '#16a34a' : 'var(--danger)' }}>{fmt(finalBalance)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: 'auto' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>טווח תחזית</label>
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} style={SEL}>
            <option value={30}>30 ימים</option>
            <option value={60}>60 ימים</option>
            <option value={90}>90 ימים</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        התחזית כוללת רק צ'קים/העברות מתוזמנים ופריטים/הוצאות חוזרים בסכום קבוע וידוע מראש — לא כוללת חובות פתוחים ללא תאריך פירעון קבוע, ולא פריטי מונה (חשמל) שסכומם תלוי בקריאה עתידית.
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickFormatter={v => '₪' + (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 10, fill: '#64748b' }} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
            <Line dataKey="balance" name="יתרה צפויה" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {result.events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>אין אירועים צפויים בטווח שנבחר.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>תאריך</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>תיאור</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>סוג</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>סכום</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>יתרה צפויה</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((ev, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 10px' }}>{fmtDMY(ev.date)}</td>
                  <td style={{ padding: '6px 10px' }}>{ev.label}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{SOURCE_LABEL[ev.source]}</td>
                  <td style={{ padding: '6px 10px', color: ev.amount < 0 ? 'var(--danger)' : '#16a34a', fontWeight: 600 }}>{fmt(ev.amount)}</td>
                  <td style={{ padding: '6px 10px', fontWeight: 700, color: ev.runningBalance >= 0 ? 'var(--text)' : 'var(--danger)' }}>{fmt(ev.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
