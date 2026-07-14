'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import PageHeader from '@/components/ui/PageHeader'
import CustomerDetailsTab from './CustomerDetailsTab'
import CustomerTrackingTab from './CustomerTrackingTab'
import { Customer, CustomerLedgerDebt, CustomerLedgerPayment, RecurringItem } from './shared'

type Tab = 'details' | 'tracking'

export default function CustomersClient() {
  const supabase = useRef(createClient()).current
  const { profile, loading: profileLoading } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()
  const didParseParams = useRef(false)

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('tracking')
  const [openId, setOpenId] = useState<string | null>(null)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerDebts, setCustomerDebts] = useState<CustomerLedgerDebt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [customerPayments, setCustomerPayments] = useState<CustomerLedgerPayment[]>([])
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([])
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

    const [custRes, debtRes, catRes, payRes, recItemsRes] = await Promise.all([
      supabase.from('customers').select('*').eq('tenant_id', tid).order('name'),
      supabase.from('customer_ledger_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('customer_categories').select('name').eq('tenant_id', tid).order('name'),
      supabase.from('customer_ledger_payments').select('*').eq('tenant_id', tid),
      supabase.from('recurring_items').select('*').eq('tenant_id', tid).not('customer_id', 'is', null).order('created_at'),
    ])

    if (custRes.data) setCustomers(custRes.data)
    else if (custRes.error) showToast('שגיאה בטעינת לקוחות: ' + custRes.error.message, 'error')
    if (debtRes.data) setCustomerDebts(debtRes.data)
    if (catRes.data) setCategories(catRes.data.map(r => r.name))
    if (payRes.data) setCustomerPayments(payRes.data)
    if (recItemsRes.data) setRecurringItems(recItemsRes.data)
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    setLoading(false)
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
    const ch = supabase.channel('customers-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_ledger_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_ledger_payments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_items' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  const openTracking = (customerId: string) => {
    setOpenId(customerId)
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
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M1 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>}
        iconBg="linear-gradient(135deg,#78716c,#a8a29e)"
        iconShadow="#78716c44"
        title="לקוחות"
        subtitle="ניהול לקוחות הקפה, יתרות ותנועות, ומעקב חובות ותשלומים"
      />

      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
        {([
          ['tracking', '📋 מעקב'],
          ['details', '💳 פרטים'],
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
        <CustomerTrackingTab
          tenantId={tenantIdRef.current!}
          tenantName={tenantName}
          customers={customers}
          customerDebts={customerDebts}
          customerPayments={customerPayments}
          recurringItems={recurringItems}
          openId={openId}
          reload={loadAll}
        />
      ) : (
        <CustomerDetailsTab
          tenantId={tenantIdRef.current!}
          customers={customers}
          debts={customerDebts}
          categories={categories}
          openId={openId}
          onOpenTracking={openTracking}
          reload={loadAll}
        />
      )}
    </div>
  )
}
