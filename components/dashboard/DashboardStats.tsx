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
      <div className="stat-card-split-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>💳 לקוחות <span style={{ color: 'var(--danger)', fontWeight: 600 }}>({custCount})</span></span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{fmt(customerDebts)}</span>
      </div>
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <div className="stat-card-split-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
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
        padding: '14px 16px', borderTop: '3px solid var(--sky)', cursor: 'pointer',
        transition: 'transform .15s, box-shadow .15s',
        display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)' }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>🚗 רכבים</div>
      <div className="stat-card-split-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📦 למכירה</span>
        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--sky)' }}>{inInventory}</span>
      </div>
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <div className="stat-card-split-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📋 בקשות פתוחות</span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: openRequests > 0 ? 'var(--purple)' : 'var(--text-muted)' }}>{openRequests}</span>
      </div>
    </div>
  )
}

export default function DashboardStats() {
  const [stats, setStats]     = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [modules, setModules] = useState<string[]>([])

  // helper: admin bypasses all module checks
  function can(...mods: string[]) {
    if (isAdmin) return true
    return mods.some(m => modules.includes(m))
  }

  const fetchStats = async (admin: boolean, mods: string[]) => {
    const supabase = createClient()
    const canMod   = (...m: string[]) => admin || m.some(x => mods.includes(x))

    const now  = new Date()
    const y    = now.getFullYear()
    const m    = String(now.getMonth() + 1).padStart(2, '0')
    const from = `${y}-${m}-01`
    const to   = `${y}-${m}-31`

    // Only fetch data the user is allowed to see
    const [expenses, incomeRes, custDebts, suppDebts, emps, products, tires, quotes, cars, carReqs, alignJobs, inspections] = await Promise.all([
      canMod('expenses')                   ? supabase.from('expenses').select('amount').gte('date', from).lte('date', to)           : Promise.resolve({ data: [] }),
      canMod('income', 'expenses')         ? supabase.from('income').select('amount').gte('date', from).lte('date', to)             : Promise.resolve({ data: [] }),
      canMod('debts')                      ? supabase.from('customer_debts').select('amount,paid').eq('is_closed', false)           : Promise.resolve({ data: [] }),
      canMod('debts')                      ? supabase.from('supplier_debts').select('amount,paid').eq('is_closed', false)           : Promise.resolve({ data: [] }),
      canMod('employees')                  ? supabase.from('employees').select('id').eq('is_active', true)                         : Promise.resolve({ data: [] }),
      canMod('products', 'products_view')  ? supabase.from('products').select('qty')                                               : Promise.resolve({ data: [] }),
      canMod('tires', 'tires_view')        ? supabase.from('tires').select('qty')                                                  : Promise.resolve({ data: [] }),
      canMod('quotes')                     ? supabase.from('quotes').select('id').eq('status', 'open')                             : Promise.resolve({ data: [] }),
      canMod('cars')                       ? supabase.from('cars').select('status').neq('status', 'sold')                          : Promise.resolve({ data: [] }),
      canMod('cars')                       ? supabase.from('car_requests').select('id').eq('status', 'open')                       : Promise.resolve({ data: [] }),
      canMod('alignment')                  ? supabase.from('alignment_jobs').select('id').in('status', ['waiting', 'in_progress', 'done']) : Promise.resolve({ data: [] }),
      canMod('inspections')               ? supabase.from('car_inspections').select('id')                                         : Promise.resolve({ data: [] }),
    ])

    const sum     = (arr: { amount: number }[]) => (arr ?? []).reduce((s, r) => s + Number(r.amount), 0)
    const debtBal = (arr: { amount: number; paid: number }[]) =>
      (arr ?? []).reduce((s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid)), 0)
    const invCount = (products.data ?? []).reduce((s, r) => s + r.qty, 0)
                   + (tires.data ?? []).reduce((s, r) => s + r.qty, 0)

    setStats({
      expensesMonth:    sum(expenses.data ?? []),
      incomeMonth:      sum(incomeRes.data ?? []),
      customerDebts:    debtBal(custDebts.data ?? []),
      supplierDebts:    debtBal(suppDebts.data ?? []),
      custDebtCount:    (custDebts.data ?? []).length,
      suppDebtCount:    (suppDebts.data ?? []).length,
      activeEmployees:  (emps.data ?? []).length,
      inventoryItems:   invCount,
      openQuotes:       (quotes.data ?? []).length,
      carsInInventory:  (cars.data ?? []).filter((c: { status: string }) => c.status === 'available').length,
      openCarRequests:  (carReqs.data ?? []).length,
      tiresInStock:     (tires.data ?? []).filter((r: { qty: number }) => r.qty > 0).length,
      activeJobs:       (alignJobs.data ?? []).length,
      totalInspections: (inspections.data ?? []).length,
    })
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase.from('profiles').select('role, allowed_modules').eq('id', user.id).single()
        .then(({ data: p }) => {
          const admin = p?.role === 'admin' || p?.role === 'super_admin'
          const mods: string[] = p?.allowed_modules ?? []
          setIsAdmin(admin)
          setModules(mods)
          fetchStats(admin, mods)
        })
    })

    const channel = supabase
      .channel('dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // re-fetch with current permissions (captured in closure via state)
        fetchStats(isAdmin, modules)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'minmax(90px, 130px)', gap: '16px', alignContent: 'start' }}>
      {Array(6).fill(0).map((_, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '14px', borderTop: '3px solid #e2e8f0' }}>
          <div className="shimmer" style={{ width: 44, height: 44, borderRadius: '10px', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="shimmer" style={{ height: 22, width: '60%', borderRadius: '5px' }} />
            <div className="shimmer" style={{ height: 12, width: '80%', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  )

  const profit = stats.incomeMonth - stats.expensesMonth

  const cardGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  }

  const sectionLabel = (icon: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )

  const showFinance = can('income', 'expenses', 'debts', 'products', 'employees')
  const showTires   = can('tires', 'tires_view', 'alignment')
  const showCars    = can('cars', 'inspections')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── פיננסי ומשרד ── */}
      {showFinance && (
        <div>
          {sectionLabel('💼', 'פיננסי ומשרד')}
          <div style={cardGrid}>
            {can('income', 'expenses') && <StatCard label="הכנסות החודש" value={stats.incomeMonth}   icon="💰" color="var(--primary)" isCurrency href="/income" />}
            {can('expenses')           && <StatCard label="הוצאות החודש" value={stats.expensesMonth} icon="📤" color="var(--danger)"  isCurrency href="/expenses" />}
            {can('income', 'expenses') && <StatCard label="רווח החודש"   value={profit}              icon="📈" color={profit >= 0 ? 'var(--primary)' : 'var(--danger)'} isCurrency href="/income" />}
            {can('debts') && (
              <DebtCard
                customerDebts={stats.customerDebts}
                supplierDebts={stats.supplierDebts}
                custCount={stats.custDebtCount}
                suppCount={stats.suppDebtCount}
                href="/debts"
              />
            )}
            {can('products', 'products_view') && <StatCard label="פריטים במלאי" value={stats.inventoryItems}  icon="📦" color="var(--purple)" href="/products" />}
            {can('employees')                 && <StatCard label="עובדים פעילים" value={stats.activeEmployees} icon="👷" color="var(--purple)" href="/employees" />}
          </div>
        </div>
      )}

      {/* ── פנצרייה ── */}
      {showTires && (
        <div>
          {sectionLabel('🔘', 'פנצרייה')}
          <div style={cardGrid}>
            {can('tires', 'tires_view') && <StatCard label="סוגי צמיג במלאי"     value={stats.tiresInStock} icon="🔘" color="var(--cyan)"    href="/tires" />}
            {can('alignment')           && <StatCard label="עבודות פרונט פעילות" value={stats.activeJobs}   icon="🔩" color="var(--warning)" href="/alignment" />}
          </div>
        </div>
      )}

      {/* ── רכבים ── */}
      {showCars && (
        <div>
          {sectionLabel('🚗', 'רכבים')}
          <div style={cardGrid}>
            {can('cars')        && <CarsCard inInventory={stats.carsInInventory} openRequests={stats.openCarRequests} href="/cars" />}
            {can('inspections') && <StatCard label="בדיקות קניה" value={stats.totalInspections} icon="📝" color="var(--purple)" href="/inspections" />}
          </div>
        </div>
      )}

    </div>
  )
}
