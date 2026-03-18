'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthData {
  month: string
  label: string
  income: number
  expenses: number
  profit: number
}

interface CategoryData { name: string; value: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('he-IL', { month: 'short' })
}

function fmt(v: number) {
  return '₪' + Math.abs(v).toLocaleString('he-IL', { maximumFractionDigits: 0 })
}

const COLORS = ['#1a9e5c', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

// ── Section card ──────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)', border: '1px solid var(--border)',
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>{title}</div>
      {children}
    </div>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: {name: string; value: number; color: string}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardCharts() {
  const [monthData,    setMonthData]    = useState<MonthData[]>([])
  const [expCatData,   setExpCatData]   = useState<CategoryData[]>([])
  const [incCatData,   setIncCatData]   = useState<CategoryData[]>([])
  const [debtData,     setDebtData]     = useState<CategoryData[]>([])
  const [loading,      setLoading]      = useState(true)
  const [canFinance,   setCanFinance]   = useState(false) // expenses / income
  const [canDebts,     setCanDebts]     = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase.from('profiles').select('role, allowed_modules').eq('id', user.id).single()
        .then(({ data: p }) => {
          const admin = p?.role === 'admin' || p?.role === 'super_admin'
          const mods: string[] = p?.allowed_modules ?? []
          const finance = admin || mods.includes('expenses') || mods.includes('income')
          const debts   = admin || mods.includes('debts')
          setCanFinance(finance)
          setCanDebts(debts)
          load(finance, debts)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(finance: boolean, debts: boolean) {
    const supabase = createClient()

    const now     = new Date()
    const from    = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr   = now.toISOString().slice(0, 10)

    const [expRes, incRes, custDebts, suppDebts] = await Promise.all([
      finance ? supabase.from('expenses').select('date, amount, category').gte('date', fromStr).lte('date', toStr) : Promise.resolve({ data: [] }),
      finance ? supabase.from('income').select('date, amount, category').gte('date', fromStr).lte('date', toStr)   : Promise.resolve({ data: [] }),
      debts   ? supabase.from('customer_debts').select('amount, paid').eq('is_closed', false)                      : Promise.resolve({ data: [] }),
      debts   ? supabase.from('supplier_debts').select('amount, paid').eq('is_closed', false)                      : Promise.resolve({ data: [] }),
    ])

    // Build month map
    const map: Record<string, { income: number; expenses: number }> = {}
    let d = new Date(from)
    while (d <= now) {
      map[toMonthStr(d)] = { income: 0, expenses: 0 }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }

    for (const r of expRes.data ?? []) {
      const k = r.date.slice(0, 7)
      if (map[k]) map[k].expenses += Number(r.amount)
    }
    for (const r of incRes.data ?? []) {
      const k = r.date.slice(0, 7)
      if (map[k]) map[k].income += Number(r.amount)
    }

    const months: MonthData[] = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: monthLabel(month),
        income:   Math.round(data.income),
        expenses: Math.round(data.expenses),
        profit:   Math.round(data.income - data.expenses),
      }))
    setMonthData(months)

    // Expense categories (current month)
    const curFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const curTo   = toStr
    const [curExp, curInc] = await Promise.all([
      supabase.from('expenses').select('amount, category').gte('date', curFrom).lte('date', curTo),
      supabase.from('income').select('amount, category').gte('date', curFrom).lte('date', curTo),
    ])

    // Aggregate categories
    const expMap: Record<string, number> = {}
    for (const r of curExp.data ?? []) {
      expMap[r.category] = (expMap[r.category] || 0) + Number(r.amount)
    }
    setExpCatData(
      Object.entries(expMap)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    )

    const incMap: Record<string, number> = {}
    for (const r of curInc.data ?? []) {
      incMap[r.category] = (incMap[r.category] || 0) + Number(r.amount)
    }
    setIncCatData(
      Object.entries(incMap)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    )

    // Debt breakdown
    const custBal = (custDebts.data ?? []).reduce((s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid)), 0)
    const suppBal = (suppDebts.data ?? []).reduce((s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid)), 0)
    setDebtData([
      { name: 'חובות לקוחות', value: Math.round(custBal) },
      { name: 'חובות לספקים', value: Math.round(suppBal) },
    ])

    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {Array(4).fill(0).map((_, i) => (
        <div key={i} style={{ height: '280px', background: '#f1f5f9', borderRadius: 'var(--radius)' }} />
      ))}
    </div>
  )

  if (!canFinance && !canDebts) return (
    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '14px' }}>
      אין נתונים זמינים
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

      {/* Row 1: Income vs Expenses bar chart */}
      {canFinance && <ChartCard title="הכנסות מול הוצאות – 6 חודשים אחרונים">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tickFormatter={v => '₪' + (v/1000).toFixed(0) + 'k'} tick={{ fontSize: 11, fill: '#64748b' }} width={52} />
            <Tooltip content={<CurrencyTooltip />} />
            <Legend formatter={v => v === 'income' ? 'הכנסות' : 'הוצאות'} />
            <Bar dataKey="income"   name="income"   fill="var(--primary)" radius={[4,4,0,0]} />
            <Bar dataKey="expenses" name="expenses" fill="#ef4444"        radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>}

      {/* Row 2: Profit line + category pies */}
      {canFinance && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <ChartCard title="רווח חודשי">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={v => '₪' + (v/1000).toFixed(0) + 'k'} tick={{ fontSize: 10, fill: '#64748b' }} width={48} />
              <Tooltip content={<CurrencyTooltip />} />
              <Line dataKey="profit" name="רווח" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: 'var(--primary)' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="הוצאות לפי קטגוריה (חודש נוכחי)">
          {expCatData.length === 0
            ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין נתונים</div>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={expCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {expCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
          }
        </ChartCard>

        <ChartCard title="הכנסות לפי קטגוריה (חודש נוכחי)">
          {incCatData.length === 0
            ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין נתונים</div>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={incCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {incCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
          }
        </ChartCard>
      </div>
      )}

      {/* Row 3: Debt breakdown */}
      {canDebts && (debtData[0]?.value > 0 || debtData[1]?.value > 0) && (
        <ChartCard title="יתרת חובות פתוחים">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {debtData.map((d, i) => (
              <div key={d.name} style={{
                padding: '16px', borderRadius: '10px', textAlign: 'center',
                background: i === 0 ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${i === 0 ? '#fecaca' : '#fde68a'}`,
              }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: i === 0 ? '#ef4444' : '#f59e0b' }}>{fmt(d.value)}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{d.name}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  )
}
