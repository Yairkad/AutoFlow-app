'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Section = 'finance' | 'tires' | 'cars'
type CardId = 'income' | 'expenses' | 'profit' | 'debts' | 'products' | 'employees' | 'tires' | 'alignment' | 'cars' | 'inspections'

const DEFAULT_LAYOUT: Record<CardId, Section> = {
  income: 'finance', expenses: 'finance', profit: 'finance',
  debts: 'finance', products: 'finance', employees: 'finance',
  tires: 'tires', alignment: 'tires',
  cars: 'cars', inspections: 'cars',
}

const LAYOUT_KEY = 'dashboard-layout-v1'

// Module-level cache — survives navigation; backed by sessionStorage so it survives refresh too
interface StatsCache { stats: Stats; admin: boolean; modules: string[]; ts: number }
const CACHE_TTL = 90_000
const CACHE_KEY = 'dash-stats-cache'

function readCache(): StatsCache | null {
  try {
    const s = sessionStorage.getItem(CACHE_KEY)
    if (!s) return null
    const c = JSON.parse(s) as StatsCache
    return Date.now() - c.ts < CACHE_TTL ? c : null
  } catch { return null }
}
function writeCache(c: StatsCache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

let _cache: StatsCache | null = readCache()

function loadLayout(): Record<CardId, Section> {
  try {
    const s = localStorage.getItem(LAYOUT_KEY)
    return s ? { ...DEFAULT_LAYOUT, ...JSON.parse(s) } : { ...DEFAULT_LAYOUT }
  } catch { return { ...DEFAULT_LAYOUT } }
}

function saveLayout(l: Record<CardId, Section>) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(l))
}

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
      className="stat-card stat-card-double"
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
      <div className="stat-card-double-title" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>חובות</div>
      <div className="stat-card-double-body">
        <div className="stat-card-double-col">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>💳 לקוחות <span style={{ color: 'var(--danger)', fontWeight: 600 }}>({custCount})</span></span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{fmt(customerDebts)}</span>
        </div>
        <div className="stat-card-double-sep" />
        <div className="stat-card-double-col">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🏭 ספקים <span style={{ color: 'var(--warning)', fontWeight: 600 }}>({suppCount})</span></span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{fmt(supplierDebts)}</span>
        </div>
      </div>
    </div>
  )
}

function CarsCard({ inInventory, openRequests, href }: { inInventory: number; openRequests: number; href: string }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(href)}
      className="stat-card stat-card-double"
      style={{
        background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        padding: '14px 16px', borderTop: '3px solid var(--sky)', cursor: 'pointer',
        transition: 'transform .15s, box-shadow .15s',
        display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)' }}
    >
      <div className="stat-card-double-title" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>🚗 רכבים</div>
      <div className="stat-card-double-body">
        <div className="stat-card-double-col">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📦 למכירה</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--sky)' }}>{inInventory}</span>
        </div>
        <div className="stat-card-double-sep" />
        <div className="stat-card-double-col">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📋 בקשות פתוחות</span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: openRequests > 0 ? 'var(--purple)' : 'var(--text-muted)' }}>{openRequests}</span>
        </div>
      </div>
    </div>
  )
}

export default function DashboardStats() {
  const cached = _cache && (Date.now() - _cache.ts < CACHE_TTL) ? _cache : null

  const [stats, setStats]     = useState<Stats>(cached?.stats ?? EMPTY)
  const [loading, setLoading] = useState(!cached)
  const [isAdmin, setIsAdmin] = useState(cached?.admin ?? false)
  const [modules, setModules] = useState<string[]>(cached?.modules ?? [])
  const [editLayout, setEditLayout] = useState(false)
  const [layout, setLayout]         = useState<Record<CardId, Section>>(DEFAULT_LAYOUT)
  const dragCard = useRef<CardId | null>(null)

  useEffect(() => { setLayout(loadLayout()) }, [])

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

    const next: Stats = {
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
    }

    _cache = { stats: next, admin, modules: mods, ts: Date.now() }
    writeCache(_cache)
    setStats(next)
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    let admin = cached?.admin ?? false
    let mods  = cached?.modules ?? []

    // getSession() reads from localStorage — no network round trip
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) { setLoading(false); return }

      supabase.from('profiles').select('role, allowed_modules').eq('id', user.id).single()
        .then(({ data: p }) => {
          admin = p?.role === 'admin' || p?.role === 'super_admin'
          mods  = p?.allowed_modules ?? []
          setIsAdmin(admin)
          setModules(mods)
          fetchStats(admin, mods)
        })
    })

    const channel = supabase
      .channel('dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchStats(admin, mods)
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

  // All cards with their render fn and permission check
  const allCards: { id: CardId; show: boolean; node: React.ReactNode }[] = [
    { id: 'income',     show: can('income','expenses'), node: <StatCard label="הכנסות החודש" value={stats.incomeMonth}   icon="💰" color="var(--primary)" isCurrency href="/income" /> },
    { id: 'expenses',   show: can('expenses'),          node: <StatCard label="הוצאות החודש" value={stats.expensesMonth} icon="📤" color="var(--danger)"  isCurrency href="/expenses" /> },
    { id: 'profit',     show: can('income','expenses'), node: <StatCard label="רווח החודש"   value={profit}              icon="📈" color={profit >= 0 ? 'var(--primary)' : 'var(--danger)'} isCurrency href="/income" /> },
    { id: 'debts',      show: can('debts'),             node: <DebtCard customerDebts={stats.customerDebts} supplierDebts={stats.supplierDebts} custCount={stats.custDebtCount} suppCount={stats.suppDebtCount} href="/debts" /> },
    { id: 'products',   show: can('products','products_view'), node: <StatCard label="פריטים במלאי" value={stats.inventoryItems}  icon="📦" color="var(--purple)" href="/products" /> },
    { id: 'employees',  show: can('employees'),         node: <StatCard label="עובדים פעילים" value={stats.activeEmployees} icon="👷" color="var(--purple)" href="/employees" /> },
    { id: 'tires',      show: can('tires','tires_view'),node: <StatCard label="סוגי צמיג במלאי" value={stats.tiresInStock} icon="🔘" color="var(--cyan)" href="/tires" /> },
    { id: 'alignment',  show: can('alignment'),         node: <StatCard label="עבודות פרונט" value={stats.activeJobs} icon="🔩" color="var(--warning)" href="/alignment" /> },
    { id: 'cars',       show: can('cars'),              node: <CarsCard inInventory={stats.carsInInventory} openRequests={stats.openCarRequests} href="/cars" /> },
    { id: 'inspections',show: can('inspections'),       node: <StatCard label="בדיקות קניה" value={stats.totalInspections} icon="📝" color="var(--purple)" href="/inspections" /> },
  ]

  const moveCard = (cardId: CardId, toSection: Section) => {
    const next = { ...layout, [cardId]: toSection }
    setLayout(next)
    saveLayout(next)
  }

  const cardGrid: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', gridAutoRows: '90px',
  }

  const SECTIONS: { id: Section; icon: string; label: string }[] = [
    { id: 'finance', icon: '💼', label: 'פיננסי ומשרד' },
    { id: 'tires',   icon: '🔘', label: 'פנצרייה' },
    { id: 'cars',    icon: '🚗', label: 'רכבים' },
  ]

  const renderSection = (sec: Section, icon: string, label: string) => {
    const cards = allCards.filter(c => c.show && layout[c.id] === sec)
    if (cards.length === 0 && !editLayout) return null
    return (
      <div key={sec}
        onDragOver={e => { if (editLayout) e.preventDefault() }}
        onDrop={e => {
          e.preventDefault()
          if (dragCard.current && editLayout) moveCard(dragCard.current, sec)
        }}
        style={{ minHeight: editLayout ? 80 : undefined }}
      >
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
          <div style={{ flex: 1, height: 1, background: editLayout ? 'var(--primary)' : 'var(--border)', transition: 'background .2s' }} />
          {editLayout && (
            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>שחרר כאן</span>
          )}
        </div>

        {/* Cards grid */}
        <div className="cards-section-grid" style={{ ...cardGrid, minHeight: editLayout && cards.length === 0 ? 70 : undefined,
          background: editLayout && cards.length === 0 ? '#f0fdf4' : undefined,
          borderRadius: editLayout && cards.length === 0 ? 10 : undefined,
          border: editLayout && cards.length === 0 ? '2px dashed var(--primary)' : undefined,
        }}>
          {cards.length === 0 && editLayout && (
            <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: 13, fontWeight: 600, padding: 16 }}>
              גרור לכאן
            </div>
          )}
          {cards.map(c => (
            <div key={c.id}
              className={c.id === 'debts' || c.id === 'cars' ? 'card-slot card-slot-double' : 'card-slot'}
              draggable={editLayout}
              onDragStart={() => { dragCard.current = c.id }}
              onDragEnd={() => { dragCard.current = null }}
              style={{
                cursor: editLayout ? 'grab' : undefined,
                opacity: 1,
                position: 'relative',
              }}
            >
              {editLayout && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 5, borderRadius: 'var(--radius)',
                  background: 'rgba(16,185,129,0.08)', border: '2px dashed var(--primary)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                  padding: 6, pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 16 }}>⠿</span>
                </div>
              )}
              {c.node}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Edit layout toggle */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
          {editLayout && (
            <button onClick={() => { setLayout({ ...DEFAULT_LAYOUT }); saveLayout({ ...DEFAULT_LAYOUT }) }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
              אפס פריסה
            </button>
          )}
          <button onClick={() => setEditLayout(v => !v)}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: editLayout ? 'var(--primary)' : 'none', color: editLayout ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            {editLayout ? '✓ סיום עריכה' : '⚙️ ערוך פריסה'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {SECTIONS.map(s => renderSection(s.id, s.icon, s.label))}
      </div>
    </div>
  )
}
