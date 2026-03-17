'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  expensesMonth:   number
  incomeMonth:     number
  customerDebts:   number
  supplierDebts:   number
  custDebtCount:   number
  suppDebtCount:   number
  activeEmployees: number
  inventoryItems:  number
  openQuotes:      number
  carsInInventory: number
  openCarRequests: number
  tiresInStock:    number
  activeJobs:      number
  totalInspections: number
}

const EMPTY: Stats = {
  expensesMonth: 0, incomeMonth: 0, customerDebts: 0, supplierDebts: 0,
  custDebtCount: 0, suppDebtCount: 0, activeEmployees: 0, inventoryItems: 0, openQuotes: 0,
  carsInInventory: 0, openCarRequests: 0, tiresInStock: 0,
  activeJobs: 0, totalInspections: 0,
}

function fmt(n: number) {
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function StatCard({ label, value, icon, color, isCurrency = false, href, sub }: {
  label: string; value: number; icon: string; color: string
  isCurrency?: boolean; href?: string; sub?: string
}) {
  const router = useRouter()
  return (
    <div
      onClick={() => href && router.push(href)}
      className="stat-card"
      style={{
        background: '#fff',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        borderTop: `3px solid ${color}`,
        cursor: href ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { if (href) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)' }}}
      onMouseLeave={e => { if (href) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)' }}}
    >
      <div className="stat-card-icon" style={{
        width: 44, height: 44,
        borderRadius: '10px',
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div className="stat-card-value" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
          {isCurrency ? fmt(value) : value.toLocaleString('he-IL')}
        </div>
        <div className="stat-card-label" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color, fontWeight: 600, marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

function DebtCard({ customerDebts, supplierDebts, custCount, suppCount, href }: {
  customerDebts: number; supplierDebts: number; custCount: number; suppCount: number; href: string
}) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(href)}
      className="stat-card"
      style={{
        background: '#fff',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '14px 16px',
        borderTop: '3px solid var(--danger)',
        cursor: 'pointer',
        transition: 'transform .15s, box-shadow .15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        justifyContent: 'center',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)' }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>חובות</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>💳 לקוחות <span style={{ color: 'var(--danger)', fontWeight: 600 }}>({custCount})</span></span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{fmt(customerDebts)}</span>
      </div>
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🏭 ספקים <span style={{ color: 'var(--warning)', fontWeight: 600 }}>({suppCount})</span></span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{fmt(supplierDebts)}</span>
      </div>
    </div>
  )
}

function CarsCard({ inInventory, openRequests, href }: { inInventory: number; openRequests: number; href: string }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(href)}
      className="stat-card"
      style={{
        background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        padding: '14px 16px', borderTop: '3px solid #0369a1', cursor: 'pointer',
        transition: 'transform .15s, box-shadow .15s',
        display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)' }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>🚗 רכבים</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📦 למכירה</span>
        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0369a1' }}>{inInventory}</span>
      </div>
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📋 בקשות פתוחות</span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: openRequests > 0 ? '#7c3aed' : 'var(--text-muted)' }}>{openRequests}</span>
      </div>
    </div>
  )
}

export default function DashboardStats() {
  const [stats, setStats]     = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(true)

  const fetchStats = async () => {
    const supabase = createClient()
    const now      = new Date()
    const y        = now.getFullYear()
    const m        = String(now.getMonth() + 1).padStart(2, '0')
    const from     = `${y}-${m}-01`
    const to       = `${y}-${m}-31`

    const [expenses, incomeRes, custDebts, suppDebts, emps, products, tires, quotes, cars, carReqs, alignJobs, inspections] = await Promise.all([
      supabase.from('expenses').select('amount').gte('date', from).lte('date', to),
      supabase.from('income').select('amount').gte('date', from).lte('date', to),
      supabase.from('customer_debts').select('amount,paid').eq('is_closed', false),
      supabase.from('supplier_debts').select('amount,paid').eq('is_closed', false),
      supabase.from('employees').select('id').eq('is_active', true),
      supabase.from('products').select('qty'),
      supabase.from('tires').select('qty'),
      supabase.from('quotes').select('id').eq('status', 'open'),
      supabase.from('cars').select('status').neq('status', 'sold'),
      supabase.from('car_requests').select('id').eq('status', 'open'),
      supabase.from('alignment_jobs').select('id').in('status', ['waiting', 'in_progress', 'done']),
      supabase.from('car_inspections').select('id'),
    ])

    const sum        = (arr: { amount: number }[]) => arr?.reduce((s, r) => s + Number(r.amount), 0) ?? 0
    const debtBal    = (arr: { amount: number; paid: number }[]) =>
      (arr ?? []).reduce((s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid)), 0)
    const invCount   = (products.data ?? []).reduce((s, r) => s + r.qty, 0)
                     + (tires.data ?? []).reduce((s, r) => s + r.qty, 0)

    setStats({
      expensesMonth:   sum(expenses.data ?? []),
      incomeMonth:     sum(incomeRes.data ?? []),
      customerDebts:   debtBal(custDebts.data ?? []),
      supplierDebts:   debtBal(suppDebts.data ?? []),
      custDebtCount:   (custDebts.data ?? []).length,
      suppDebtCount:   (suppDebts.data ?? []).length,
      activeEmployees: (emps.data ?? []).length,
      inventoryItems:  invCount,
      openQuotes:      (quotes.data ?? []).length,
      carsInInventory: (cars.data ?? []).filter(c => c.status === 'available').length,
      openCarRequests:  (carReqs.data ?? []).length,
      tiresInStock:     (tires.data ?? []).filter(r => r.qty > 0).length,
      activeJobs:       (alignJobs.data ?? []).length,
      totalInspections: (inspections.data ?? []).length,
    })
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
    const supabase = createClient()
    const channel  = supabase
      .channel('dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public' }, fetchStats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (loading) return (
    <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'minmax(90px, 130px)', gap: '16px', alignContent: 'start' }}>
      {Array(6).fill(0).map((_, i) => (
        <div key={i} style={{ background: '#f1f5f9', borderRadius: 'var(--radius)' }} />
      ))}
    </div>
  )

  const profit = stats.incomeMonth - stats.expensesMonth

  return (
    <div className="stats-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridAutoRows: 'minmax(90px, 130px)',
      gap: '16px',
      alignContent: 'start',
    }}>
      <StatCard label="הכנסות החודש"    value={stats.incomeMonth}    icon="💰" color="var(--primary)"  isCurrency href="/income" />
      <StatCard label="הוצאות החודש"    value={stats.expensesMonth}  icon="📤" color="var(--danger)"   isCurrency href="/expenses" />
      <StatCard label="רווח החודש"      value={profit}               icon="📈" color={profit >= 0 ? 'var(--primary)' : 'var(--danger)'} isCurrency />
      <DebtCard
        customerDebts={stats.customerDebts}
        supplierDebts={stats.supplierDebts}
        custCount={stats.custDebtCount}
        suppCount={stats.suppDebtCount}
        href="/debts"
      />
      <StatCard label="פריטים במלאי"   value={stats.inventoryItems}  icon="📦" color="#8b5cf6"         href="/products" />
      <StatCard label="עובדים פעילים"  value={stats.activeEmployees} icon="👷" color="#7c3aed"         href="/employees" />
      <CarsCard inInventory={stats.carsInInventory} openRequests={stats.openCarRequests} href="/cars" />
      <StatCard label="סוגי צמיג במלאי"   value={stats.tiresInStock}    icon="🔘" color="#0891b2" href="/tires" />
      <StatCard label="עבודות פרונט פעילות" value={stats.activeJobs}     icon="🔩" color="#d97706" href="/alignment" />
      <StatCard label="בדיקות קניה"         value={stats.totalInspections} icon="📝" color="#7c3aed" href="/inspections" />
    </div>
  )
}
