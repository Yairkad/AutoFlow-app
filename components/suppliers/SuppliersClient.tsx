'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import PageHeader from '@/components/ui/PageHeader'
import SupplierDetailsTab from './SupplierDetailsTab'
import SupplierTrackingTab from './SupplierTrackingTab'
import { Supplier, SupplierDebt, ScheduledPayment, SupplierDebtPayment, RecurringItem } from './shared'

type Tab = 'details' | 'tracking'

export default function SuppliersClient() {
  const supabase = useRef(createClient()).current
  const { profile, loading: profileLoading } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()
  const autoExpenseDoneRef = useRef(false)
  const didParseParams = useRef(false)

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('tracking')
  const [openId, setOpenId] = useState<string | null>(null)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierDebts, setSupplierDebts] = useState<SupplierDebt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [debtPayments, setDebtPayments] = useState<SupplierDebtPayment[]>([])
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([])
  const [expenseCats, setExpenseCats] = useState<string[]>(['ספקים', 'אחר'])
  const [tenantName, setTenantName] = useState('AutoFlow')

  const resolveTenant = useCallback(async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    if (!profile) return null
    tenantIdRef.current = profile.tenantId
    return tenantIdRef.current
  }, [profile])

  const loadAll = useCallback(async () => {
    const tid = await resolveTenant()
    if (!tid) {
      // Profile context gave up resolving (e.g. no session) — stop spinning instead of hanging forever.
      if (!profileLoading) setLoading(false)
      return
    }
    setLoading(true)

    const [suppRes, debtRes, catRes, paymentsRes, debtPaymentsRes, expCatRes, recItemsRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('tenant_id', tid).order('name'),
      supabase.from('supplier_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('supplier_categories').select('name').eq('tenant_id', tid).order('name'),
      supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date'),
      supabase.from('supplier_debt_payments').select('*').eq('tenant_id', tid),
      supabase.from('expense_categories').select('name').eq('tenant_id', tid).order('created_at'),
      supabase.from('recurring_items').select('*').eq('tenant_id', tid).not('supplier_id', 'is', null).order('created_at'),
    ])

    if (suppRes.data) setSuppliers(suppRes.data)
    else if (suppRes.error) showToast('שגיאה בטעינת ספקים: ' + suppRes.error.message, 'error')
    if (debtRes.data) setSupplierDebts(debtRes.data)
    if (catRes.data) setCategories(catRes.data.map(r => r.name))
    const payments: ScheduledPayment[] = paymentsRes.data ?? []
    setScheduledPayments(payments)
    setDebtPayments(debtPaymentsRes.data ?? [])
    if (expCatRes.data && expCatRes.data.length > 0) setExpenseCats(expCatRes.data.map(r => r.name))
    if (recItemsRes.data) setRecurringItems(recItemsRes.data)
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    setLoading(false)

    // Auto-expense overdue scheduled payments — runs once per session, regardless of active tab
    if (!autoExpenseDoneRef.current) {
      autoExpenseDoneRef.current = true
      const today = new Date().toISOString().slice(0, 10)
      const overdue = payments.filter(p => !p.is_paid && p.due_date <= today)
      if (overdue.length > 0) {
        for (const p of overdue) {
          const expRes = await supabase.from('expenses').insert({
            tenant_id: tid, date: p.due_date,
            category: p.category || 'ספקים',
            description: p.description, amount: p.amount,
            supplier_id: p.supplier_id,
            payment_method: p.payment_method === 'check' ? "צ'ק" : 'העברה',
            payment_ref: p.notes || null,
          }).select('id').single()
          if (!expRes.error) {
            await supabase.from('scheduled_payments').update({
              is_paid: true, paid_date: today, expense_id: expRes.data.id,
            }).eq('id', p.id)
          }
        }
        showToast(`${overdue.length} תשלומים נרשמו אוטומטית כהוצאות ✓`, 'info')
        const refreshed = await supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date')
        setScheduledPayments(refreshed.data ?? [])
      }
    }
  }, [supabase, resolveTenant, showToast, profile, profileLoading])

  useEffect(() => { loadAll() }, [loadAll])

  // Parse ?tab=details|tracking&open=<id> once
  useEffect(() => {
    if (didParseParams.current) return
    didParseParams.current = true
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    if (t === 'details' || t === 'tracking') setTab(t)
    const openParam = params.get('open')
    if (openParam) setOpenId(openParam)
  }, [])

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('suppliers-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_payments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debt_payments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_items' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  const openTracking = (supplierId: string) => {
    setOpenId(supplierId)
    setTab('tracking')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></svg>}
        iconBg="linear-gradient(135deg,#64748b,#94a3b8)"
        iconShadow="#64748b44"
        title="ספקים"
        subtitle="ניהול ספקים, אנשי קשר, ומעקב חובות ותשלומים"
      />

      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
        {([
          ['tracking', '📋 מעקב'],
          ['details', '🏭 פרטים'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${tab === t ? 'var(--primary)' : 'var(--border)'}`,
              background: tab === t ? 'var(--primary)' : '#fff',
              color: tab === t ? '#fff' : 'var(--text)',
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'tracking' ? (
        <SupplierTrackingTab
          tenantId={tenantIdRef.current!}
          tenantName={tenantName}
          suppliers={suppliers}
          supplierDebts={supplierDebts}
          scheduledPayments={scheduledPayments}
          debtPayments={debtPayments}
          recurringItems={recurringItems}
          expenseCats={expenseCats}
          openId={openId}
          reload={loadAll}
        />
      ) : (
        <SupplierDetailsTab
          tenantId={tenantIdRef.current!}
          suppliers={suppliers}
          debts={supplierDebts}
          categories={categories}
          scheduledPayments={scheduledPayments}
          openId={openId}
          onOpenTracking={openTracking}
          reload={loadAll}
        />
      )}
    </div>
  )
}
