'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { reconcileSupplierPayment } from '@/lib/debts/reconcileSupplierPayment'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerDebt {
  id: string; tenant_id: string; name: string; phone: string | null
  plate: string | null; amount: number; paid: number; description: string | null
  date: string; is_closed: boolean; created_at: string
}

interface InvoiceEntry {
  type: 'invoice' | 'karteset'
  number: string
  amount: string
}

interface SupplierDebt {
  id: string; tenant_id: string; supplier_id: string | null
  amount: number; paid: number; description: string | null
  date: string; is_closed: boolean; created_at: string
  doc_type: string | null; doc_number: string | null
  invoices: { type: string; number: string; amount: number; description?: string }[] | null
}

interface ScheduledPayment {
  id: string; tenant_id: string; description: string; amount: number
  due_date: string; payment_method: 'check' | 'transfer'
  supplier_id: string | null; category: string | null
  is_paid: boolean; paid_date: string | null; expense_id: string | null; notes: string | null
  check_number: string | null; series_id: string | null
}

interface SupplierDebtPayment {
  id: string; supplier_debt_id: string; scheduled_payment_id: string | null; amount: number
}

interface Supplier {
  id: string; name: string; phone: string | null; contact_name: string | null
}

type Tab    = 'customers' | 'suppliers' | 'summary' | 'calendar'
type Filter = 'open' | 'closed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)
const bal = (d: { amount: number; paid: number }) => Math.max(0, Number(d.amount) - Number(d.paid))
const EMPTY_INV = (): InvoiceEntry => ({ type: 'invoice', number: '', amount: '' })

const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('972')) digits = digits.startsWith('0') ? '972' + digits.slice(1) : '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '11px',
  background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px',
}
const tdSt: React.CSSProperties = { padding: '11px 12px', verticalAlign: 'middle', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function DebtsClient() {
  const supabase    = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [tab, setTab]       = useState<Tab>('customers')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([])
  const [supplierDebts, setSupplierDebts] = useState<SupplierDebt[]>([])
  const [suppliers, setSuppliers]         = useState<Supplier[]>([])

  // Row selection (for edit/delete without per-row buttons)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Customer debt form
  const [showCustModal, setShowCustModal] = useState(false)
  const [editCust, setEditCust]           = useState<CustomerDebt | null>(null)
  const [cName, setCName]   = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cPlate, setCPlate] = useState('')
  const [cAmount, setCAmount] = useState('')
  const [cDesc, setCDesc]   = useState('')
  const [cDate, setCDate]   = useState(todayISO())
  const [cSaving, setCsaving] = useState(false)

  // Supplier debt form (with multiple invoices)
  const [showSuppModal, setShowSuppModal] = useState(false)
  const [editSupp, setEditSupp]           = useState<SupplierDebt | null>(null)
  const [sSupplier, setSSupplier] = useState('')
  const [sDate, setSDate]         = useState(todayISO())
  const [sNotes, setSNotes]       = useState('')
  const [sInvoices, setSInvoices] = useState<InvoiceEntry[]>([EMPTY_INV()])
  const [sSaving, setSsaving]     = useState(false)

  // Payment modal
  const [payItem, setPayItem] = useState<{ id: string; type: 'customer' | 'supplier'; balance: number } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate]     = useState(todayISO())
  const [paySaving, setPaySaving] = useState(false)

  // Tenant name (for WA messages)
  const [tenantName, setTenantName] = useState('AutoFlow')

  // WhatsApp edit modal
  const [waModal, setWaModal] = useState<{ phone: string; text: string } | null>(null)

  // Scheduled payments (for monthly supplier view + auto-expense)
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [debtPayments, setDebtPayments] = useState<SupplierDebtPayment[]>([])
  const autoExpenseDoneRef = useRef(false)

  // ── Tenant ────────────────────────────────────────────────────────────────

  const resolveTenant = useCallback(async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    if (!profile) return null
    tenantIdRef.current = profile.tenantId
    return tenantIdRef.current
  }, [profile])

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tid = await resolveTenant()
    if (!tid) return
    setLoading(true)
    const [custRes, suppDebtRes, suppRes, paymentsRes, debtPaymentsRes] = await Promise.all([
      supabase.from('customer_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('supplier_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name,phone,contact_name').eq('tenant_id', tid).order('name'),
      supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date'),
      supabase.from('supplier_debt_payments').select('*').eq('tenant_id', tid),
    ])
    if (custRes.data)     setCustomerDebts(custRes.data)
    if (suppDebtRes.data) setSupplierDebts(suppDebtRes.data)
    if (suppRes.data)     setSuppliers(suppRes.data)
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    const payments: ScheduledPayment[] = paymentsRes.data ?? []
    setScheduledPayments(payments)
    setDebtPayments(debtPaymentsRes.data ?? [])
    setLoading(false)

    // Auto-expense overdue scheduled payments — runs once per session
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
  }, [supabase, resolveTenant, showToast, profile])

  useEffect(() => { loadAll() }, [loadAll])

  // Clear selection + reset filter on tab change
  useEffect(() => { setSelectedId(null); setFilter('open'); setSearch('') }, [tab])

  // ESC to deselect
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('debts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debts' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  // ── Customer CRUD ─────────────────────────────────────────────────────────

  const openCustModal = (d?: CustomerDebt) => {
    if (d) {
      setEditCust(d); setCName(d.name); setCPhone(d.phone ?? ''); setCPlate(d.plate ?? '')
      setCAmount(String(d.amount)); setCDesc(d.description ?? ''); setCDate(d.date)
    } else {
      setEditCust(null); setCName(''); setCPhone(''); setCPlate(''); setCAmount(''); setCDesc(''); setCDate(todayISO())
    }
    setShowCustModal(true)
  }

  const saveCustDebt = async () => {
    if (!cName.trim() || !cAmount || !cDate) { showToast('נא למלא שם, סכום ותאריך', 'error'); return }
    const tid = tenantIdRef.current!
    setCsaving(true)
    const row = {
      tenant_id: tid, name: cName.trim(), phone: cPhone.trim() || null,
      plate: cPlate.trim() || null, amount: parseFloat(cAmount),
      description: cDesc.trim() || null, date: cDate,
    }
    if (editCust) {
      const { error } = await supabase.from('customer_debts').update(row).eq('id', editCust.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setCsaving(false); return }
      showToast('עודכן ✓', 'success')
    } else {
      const { error } = await supabase.from('customer_debts').insert({ ...row, paid: 0, is_closed: false, id: crypto.randomUUID() })
      if (error) { showToast('שגיאה בשמירה', 'error'); setCsaving(false); return }
      showToast('נשמר ✓', 'success')
    }
    setCsaving(false); setShowCustModal(false); setSelectedId(null); loadAll()
  }

  const deleteCustDebt = async (id: string) => {
    if (!confirm('למחוק חוב זה?')) return
    await supabase.from('customer_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); setSelectedId(null); loadAll()
  }

  // ── Supplier CRUD ─────────────────────────────────────────────────────────

  const openSuppModal = (d?: SupplierDebt) => {
    if (d) {
      setEditSupp(d); setSSupplier(d.supplier_id ?? ''); setSDate(d.date); setSNotes(d.description ?? '')
      const existing = Array.isArray(d.invoices) && d.invoices.length > 0
        ? d.invoices.map(i => ({ type: i.type as 'invoice' | 'karteset', number: i.number, amount: String(i.amount) }))
        : d.doc_number
          ? [{ type: (d.doc_type ?? 'invoice') as 'invoice' | 'karteset', number: d.doc_number, amount: String(d.amount) }]
          : [EMPTY_INV()]
      setSInvoices(existing)
    } else {
      setEditSupp(null); setSSupplier(''); setSDate(todayISO()); setSNotes(''); setSInvoices([EMPTY_INV()])
    }
    setShowSuppModal(true)
  }

  const addInvoiceLine = () => setSInvoices(prev => [...prev, EMPTY_INV()])
  const removeInvoiceLine = (i: number) => setSInvoices(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  const updateInvoiceLine = (i: number, field: keyof InvoiceEntry, val: string) =>
    setSInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, [field]: val } : inv))

  const invoicesTotal = sInvoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0)

  const saveSuppDebt = async () => {
    const validInvoices = sInvoices.filter(i => i.number.trim() || parseFloat(i.amount) > 0)
    if (validInvoices.length === 0 && invoicesTotal === 0) { showToast('נא למלא לפחות חשבונית אחת', 'error'); return }
    if (!sDate) { showToast('נא לבחור תאריך', 'error'); return }
    const tid = tenantIdRef.current!
    setSsaving(true)

    const invoicesData = sInvoices
      .filter(i => i.number.trim() || parseFloat(i.amount) > 0)
      .map(i => ({ type: i.type, number: i.number.trim(), amount: parseFloat(i.amount) || 0 }))

    const row = {
      tenant_id: tid,
      supplier_id: sSupplier || null,
      amount: invoicesTotal || parseFloat(sInvoices[0]?.amount) || 0,
      description: sNotes.trim() || null,
      date: sDate,
      doc_type: sInvoices[0]?.type ?? 'invoice',
      doc_number: sInvoices[0]?.number.trim() ?? null,
      invoices: invoicesData,
    }
    if (editSupp) {
      const { error } = await supabase.from('supplier_debts').update(row).eq('id', editSupp.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setSsaving(false); return }
      showToast('עודכן ✓', 'success')
    } else {
      const { error } = await supabase.from('supplier_debts').insert({ ...row, paid: 0, is_closed: false, id: crypto.randomUUID() })
      if (error) { showToast('שגיאה בשמירה', 'error'); setSsaving(false); return }
      showToast('נשמר ✓', 'success')
    }
    setSsaving(false); setShowSuppModal(false); setSelectedId(null); loadAll()
  }

  const deleteSuppDebt = async (id: string) => {
    if (!confirm('למחוק חוב זה?')) return
    await supabase.from('supplier_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); setSelectedId(null); loadAll()
  }

  const addDebtForSupplier = (suppId: string) => {
    setEditSupp(null); setSSupplier(suppId); setSDate(todayISO()); setSNotes(''); setSInvoices([EMPTY_INV()])
    setShowSuppModal(true)
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  const openPay = (id: string, type: 'customer' | 'supplier', debtBalance: number) => {
    setPayItem({ id, type, balance: debtBalance })
    setPayAmount(String(debtBalance.toFixed(2))); setPayDate(todayISO())
  }

  const recordPayment = async () => {
    if (!payItem || !payAmount) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { showToast('סכום לא תקין', 'error'); return }
    setPaySaving(true)

    if (payItem.type === 'customer') {
      const debt = customerDebts.find(d => d.id === payItem.id)
      if (!debt) { setPaySaving(false); return }
      const newPaid  = Math.min(Number(debt.amount), Number(debt.paid) + amount)
      const isClosed = newPaid >= Number(debt.amount)
      const { error } = await supabase.from('customer_debts').update({ paid: newPaid, is_closed: isClosed }).eq('id', payItem.id)
      if (error) { showToast('שגיאה בתשלום', 'error'); setPaySaving(false); return }
      showToast(isClosed ? 'שולם במלואו ✓' : 'תשלום נרשם ✓', 'success')
      setPaySaving(false); setPayItem(null); loadAll()
      return
    }

    // Supplier debt — route through the same reconciler used by checks, so a
    // direct payment also leaves a supplier_debt_payments trail.
    const tid = tenantIdRef.current
    if (!tid) { setPaySaving(false); return }
    const { error } = await reconcileSupplierPayment(supabase, tid, [{ supplier_debt_id: payItem.id, amount }], null)
    if (error) { showToast('שגיאה בתשלום: ' + error, 'error'); setPaySaving(false); return }
    showToast('תשלום נרשם ✓', 'success')
    setPaySaving(false); setPayItem(null); loadAll()
  }

  const toggleClose = async (id: string, type: 'customer' | 'supplier', current: boolean) => {
    const table = type === 'customer' ? 'customer_debts' : 'supplier_debts'
    await supabase.from(table).update({ is_closed: !current }).eq('id', id)
    loadAll()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  const applyFilter = <T extends { is_closed: boolean }>(items: T[], matchSearch: (d: T) => boolean) =>
    items
      .filter(d => filter === 'all' ? true : filter === 'open' ? !d.is_closed : d.is_closed)
      .filter(d => !search.trim() || matchSearch(d))

  const filteredCust = applyFilter(customerDebts, d =>
    d.name.includes(search) || (d.phone?.includes(search) ?? false) || (d.plate?.includes(search) ?? false)
  )
  const filteredSupp = applyFilter(supplierDebts, d => {
    const suppName = suppliers.find(s => s.id === d.supplier_id)?.name ?? ''
    return suppName.includes(search) || (d.description?.includes(search) ?? false)
  })

  const openCustTotal = customerDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)
  const openSuppTotal = supplierDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)
  const netOwed       = openSuppTotal - openCustTotal

  // ── Monthly view helpers ───────────────────────────────────────────────────

  const monthKeyOf = (iso: string) => iso.slice(0, 7)
  const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
  const fmtMonth = (key: string) => { const [y, m] = key.split('-'); return `${HEB_MONTHS[parseInt(m) - 1]} ${y}` }
  const daysUntilDate = (iso: string) => { const t = new Date(); t.setHours(0,0,0,0); const d = new Date(iso + 'T00:00:00'); d.setHours(0,0,0,0); return Math.round((d.getTime()-t.getTime())/86400000) }

  // ── Selected item info ────────────────────────────────────────────────────

  const selectedCust = selectedId ? customerDebts.find(d => d.id === selectedId) : null
  const selectedSupp = selectedId ? supplierDebts.find(d => d.id === selectedId) : null
  const selectedType: 'customer' | 'supplier' | null = selectedCust ? 'customer' : selectedSupp ? 'supplier' : null

  // ── Sub-components ────────────────────────────────────────────────────────

  const TabBtn = ({ t, label, count }: { t: Tab; label: string; count?: number }) => (
    <button onClick={() => setTab(t)} style={{
      padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '13px', fontWeight: tab === t ? 600 : 400,
      color: tab === t ? 'var(--text)' : 'var(--text-muted)',
      background: tab === t ? '#fff' : 'transparent',
      borderRadius: '8px', whiteSpace: 'nowrap', flexShrink: 0,
      boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
      transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      {label}
      {count != null && count > 0 && (
        <span style={{
          background: tab === t ? '#dcfce7' : '#e2e8f0',
          color: tab === t ? '#15803d' : 'var(--text-muted)',
          borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  )

  const FilterBtn = ({ f, label }: { f: Filter; label: string }) => (
    <button onClick={() => setFilter(f)} style={{
      padding: '5px 14px', border: '1px solid',
      borderColor: filter === f ? 'var(--primary)' : 'var(--border)',
      background: filter === f ? '#f0fdf6' : 'transparent',
      color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
      borderRadius: '20px', fontSize: '12px', fontWeight: filter === f ? 600 : 400,
      cursor: 'pointer', transition: 'all .12s',
    }}>{label}</button>
  )

  const StatusChip = ({ debt }: { debt: CustomerDebt | SupplierDebt }) => {
    if (debt.is_closed)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>שולם ✓</span>
    if (Number(debt.paid) > 0)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef3c7', color: 'var(--warning)', fontWeight: 600 }}>חלקי</span>
    return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>פתוח</span>
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  const Toolbar = ({ onAdd }: { onAdd: () => void }) => (
    <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button onClick={onAdd}>+ הוסף חוב</Button>
      <div style={{ display: 'flex', gap: '6px' }}>
        <FilterBtn f="open" label="פתוחים" />
        <FilterBtn f="closed" label="סגורים" />
        <FilterBtn f="all" label="הכל" />
      </div>
      <input
        placeholder={tab === 'customers' ? 'חיפוש שם / טלפון / לוחית...' : 'חיפוש ספק / תיאור...'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="form-input" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
      />
      <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
        יתרה: <strong style={{ color: 'var(--danger)' }}>{fmt(tab === 'customers' ? openCustTotal : openSuppTotal)}</strong>
      </span>
      <ExcelMenu onExportExcel={exportExcel} />
    </div>
  )

  // Selection action bar
  const SelectionBar = () => {
    if (!selectedId || !selectedType) return null
    const debt = selectedType === 'customer' ? selectedCust! : selectedSupp!
    const phone = selectedType === 'customer'
      ? (selectedCust as CustomerDebt).phone
      : suppliers.find(s => s.id === (selectedSupp as SupplierDebt).supplier_id)?.phone ?? null
    const name = selectedType === 'customer'
      ? (selectedCust as CustomerDebt).name
      : suppliers.find(s => s.id === (selectedSupp as SupplierDebt).supplier_id)?.name ?? 'הספק'

    const waText = selectedType === 'customer'
      ? `שלום ${name}, תזכורת לגבי יתרת חוב בסך ${fmt(bal(debt))} 🙏\n${tenantName}`
      : `שלום ${name}, ברצוני לבדוק חוב בסך ${fmt(bal(debt))}.\nתודה!\n${tenantName}`

    return (
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px',
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
        padding: '10px 14px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>
          ✓ שורה נבחרה
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedType === 'customer' ? (selectedCust as CustomerDebt).name : suppliers.find(s => s.id === (selectedSupp as SupplierDebt).supplier_id)?.name ?? '—'}
          {' · '}
          <strong>{fmt(bal(debt))}</strong>
        </span>
        {/* WhatsApp – open edit modal */}
        {phone && (
          <button
            onClick={() => setWaModal({ phone, text: waText })}
            style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            💬 ווצאפ תזכורת
          </button>
        )}
        {/* Pay */}
        {!debt.is_closed && bal(debt) > 0 && (
          <button
            onClick={() => openPay(selectedId, selectedType, bal(debt))}
            style={{ padding: '5px 12px', background: '#f0fdf6', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >₪ שלם</button>
        )}
        {/* Close/open */}
        <button
          onClick={() => toggleClose(selectedId, selectedType, debt.is_closed)}
          style={{ padding: '5px 10px', background: debt.is_closed ? '#fef2f2' : '#f0fdf6', color: debt.is_closed ? 'var(--danger)' : '#16a34a', border: '1px solid', borderColor: debt.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >{debt.is_closed ? '↩ פתח' : '✓ סגור'}</button>
        {/* Edit */}
        <button
          onClick={() => selectedType === 'customer' ? openCustModal(selectedCust!) : openSuppModal(selectedSupp!)}
          style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >✏️ ערוך</button>
        {/* Delete */}
        <button
          onClick={() => selectedType === 'customer' ? deleteCustDebt(selectedId) : deleteSuppDebt(selectedId)}
          style={{ padding: '5px 10px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >🗑 מחק</button>
        {/* Deselect */}
        <button
          onClick={() => setSelectedId(null)}
          style={{ padding: '5px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
        >✕</button>
      </div>
    )
  }

  const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '14px' }}>{text}</div>
    </div>
  )

  // ── Invoice summary in supplier debt cell ─────────────────────────────────

  const InvoiceCell = ({ d }: { d: SupplierDebt }) => {
    const invList = Array.isArray(d.invoices) && d.invoices.length > 0
      ? d.invoices
      : d.doc_number ? [{ type: d.doc_type ?? 'invoice', number: d.doc_number, amount: Number(d.amount) }]
      : null

    if (!invList) return <span style={{ color: 'var(--text-muted)' }}>{d.description || '—'}</span>

    return (
      <div>
        {invList.map((inv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <span style={{
              background: inv.type === 'karteset' ? '#ede9fe' : '#e0f2fe',
              color: inv.type === 'karteset' ? '#7c3aed' : '#0369a1',
              fontSize: '10px', padding: '1px 5px', borderRadius: '4px', fontWeight: 600, flexShrink: 0,
            }}>{inv.type === 'karteset' ? 'כרטסת' : 'חשבונית'}</span>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>#{inv.number}</span>
            {invList.length > 1 && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt(inv.amount)}</span>}
          </div>
        ))}
        {d.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.description}</div>}
      </div>
    )
  }

  // ── Excel / JSON ──────────────────────────────────────────────────────────

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    if (tab === 'customers' || tab === 'summary') {
      const rows = customerDebts.map(d => ({ שם: d.name, טלפון: d.phone ?? '', לוחית: d.plate ?? '', סכום: d.amount, שולם: d.paid, יתרה: bal(d), תאריך: d.date, סטטוס: d.is_closed ? 'סגור' : 'פתוח', הערה: d.description ?? '' }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חובות לקוחות')
    }
    if (tab === 'suppliers' || tab === 'summary') {
      const rows = supplierDebts.map(d => ({ ספק: suppliers.find(s => s.id === d.supplier_id)?.name ?? '', סכום: d.amount, שולם: d.paid, יתרה: bal(d), תאריך: d.date, סטטוס: d.is_closed ? 'סגור' : 'פתוח', תיאור: d.description ?? '' }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חובות ספקים')
    }
    if (tab === 'calendar') {
      const rows = scheduledPayments.filter(p => !p.is_paid).map(p => ({
        ספק: suppliers.find(s => s.id === p.supplier_id)?.name ?? '', תיאור: p.description, סכום: p.amount,
        'תאריך פירעון': p.due_date, אמצעי: p.payment_method === 'check' ? "צ'ק" : 'העברה', 'מספר צ׳ק': p.check_number ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'יומן צ׳קים')
    }
    XLSX.writeFile(wb, 'חובות.xlsx')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
        iconBg="linear-gradient(135deg,#ef4444,#f87171)"
        iconShadow="#ef444444"
        title="חובות"
        subtitle="מעקב חובות לקוחות וספקים"
      />

      {/* Tabs */}
      <div className="scroll-x" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          <TabBtn t="customers" label="💳 לקוחות" count={customerDebts.filter(d => !d.is_closed).length} />
          <TabBtn t="suppliers" label="🏭 ספקים"  count={supplierDebts.filter(d => !d.is_closed).length} />
          <TabBtn t="calendar"  label="📅 יומן צ׳קים" count={scheduledPayments.filter(p => !p.is_paid).length} />
          <TabBtn t="summary"   label="📊 סיכום" />
        </div>
      </div>

      {/* ── CUSTOMERS TAB ── */}
      {tab === 'customers' && (
        <div>
          <Toolbar onAdd={() => openCustModal()} />
          <SelectionBar />
          {filteredCust.length === 0 ? (
            <EmptyState icon="💳" text={`אין חובות לקוחות ${filter === 'open' ? 'פתוחים' : filter === 'closed' ? 'סגורים' : ''}`} />
          ) : (
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['שם לקוח', 'טלפון', 'לוחית', 'סכום', 'שולם', 'יתרה', 'תאריך', 'סטטוס'].map(h => (
                      <th key={h} style={thSt}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCust.map((d, i) => {
                    const isSelected = selectedId === d.id
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedId(isSelected ? null : d.id)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isSelected ? '#eff6ff' : d.is_closed ? '#fafafa' : i % 2 === 0 ? '#fff' : '#fdfefe',
                          opacity: d.is_closed ? 0.65 : 1,
                          cursor: 'pointer',
                          outline: isSelected ? '2px solid #93c5fd' : undefined,
                          outlineOffset: '-1px',
                        }}
                      >
                        <td style={{ ...tdSt, fontWeight: 600 }}>
                          {d.name}
                          {d.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 400 }}>{d.description}</div>}
                        </td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{d.phone || '—'}</td>
                        <td style={tdSt}>
                          {d.plate
                            ? <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}>{d.plate}</span>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{fmt(d.amount)}</td>
                        <td style={{ ...tdSt, color: '#16a34a' }}>{fmt(d.paid)}</td>
                        <td style={{ ...tdSt, fontWeight: 700, color: bal(d) > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(bal(d))}</td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={tdSt}><StatusChip debt={d} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SUPPLIERS TAB — monthly grouped view ── */}
      {tab === 'suppliers' && (
        <div>
          <Toolbar onAdd={() => openSuppModal()} />
          <SelectionBar />
          {(() => {
            // Build per-supplier groups with monthly breakdown
            const allSuppIds = [...new Set(supplierDebts.map(d => d.supplier_id))]
            const groups = allSuppIds.map(sid => {
              const debts = supplierDebts.filter(d => d.supplier_id === sid)
              const supp = suppliers.find(s => s.id === sid)
              const totalBal = debts.reduce((s, d) => s + bal(d), 0)

              // Apply search filter at supplier level
              if (search.trim()) {
                const q = search.toLowerCase()
                const nameMatch = (supp?.name ?? '').toLowerCase().includes(q)
                const descMatch = debts.some(d => d.description?.toLowerCase().includes(q))
                if (!nameMatch && !descMatch) return null
              }

              // Apply open/closed filter
              if (filter === 'open'   && totalBal === 0) return null
              if (filter === 'closed' && totalBal > 0)  return null

              // Group debts by month key (YYYY-MM)
              const monthMap: Record<string, SupplierDebt[]> = {}
              debts.forEach(d => {
                const mk = monthKeyOf(d.date)
                if (!monthMap[mk]) monthMap[mk] = []
                monthMap[mk].push(d)
              })
              const months = Object.keys(monthMap).sort().reverse() // newest first
              const suppPayments = scheduledPayments.filter(p => p.supplier_id === sid)

              // Checks not (yet) allocated to any of this supplier's debts
              const debtIds = new Set(debts.map(d => d.id))
              const linkedIds = new Set(
                debtPayments.filter(dp => debtIds.has(dp.supplier_debt_id) && dp.scheduled_payment_id)
                  .map(dp => dp.scheduled_payment_id!)
              )
              const unlinkedPayments = suppPayments.filter(p => !p.is_paid && !linkedIds.has(p.id))

              return { sid, supp, totalBal, monthMap, months, suppPayments, unlinkedPayments }
            }).filter(Boolean) as {
              sid: string | null; supp: Supplier | undefined; totalBal: number
              monthMap: Record<string, SupplierDebt[]>; months: string[]
              suppPayments: ScheduledPayment[]; unlinkedPayments: ScheduledPayment[]
            }[]

            if (groups.length === 0) return (
              <EmptyState icon="🏭" text={`אין חובות לספקים ${filter === 'open' ? 'פתוחים' : filter === 'closed' ? 'סגורים' : ''}`} />
            )

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groups.map(group => (
                  <div key={group.sid ?? 'none'} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

                    {/* Supplier header */}
                    <div style={{ background: '#f1f5f9', borderBottom: '2px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>🏭 {group.supp?.name ?? 'ללא ספק'}</span>
                      {group.supp?.phone && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{group.supp.phone}</span>}
                      <span style={{ marginRight: 'auto', fontSize: '14px', fontWeight: 700, color: group.totalBal > 0 ? 'var(--danger)' : '#16a34a' }}>
                        יתרה כוללת: {fmt(group.totalBal)}
                      </span>
                      {group.sid && (
                        <button onClick={() => addDebtForSupplier(group.sid!)}
                          style={{ padding: '4px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          + הוסף חוב
                        </button>
                      )}
                    </div>

                    {/* Checks issued but not yet allocated to any specific month */}
                    {group.unlinkedPayments.length > 0 && (
                      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 16px', fontSize: '12px', color: '#92400e' }}>
                        ⚠ {group.unlinkedPayments.length} צ׳קים/תשלומים לספק זה לא שובצו מול חודש חוב ספציפי:{' '}
                        {group.unlinkedPayments.map(p => `${fmt(p.amount)} (${p.due_date})`).join(', ')}
                      </div>
                    )}

                    {/* Months */}
                    {group.months.map((mk, mIdx) => {
                      const monthDebts = group.monthMap[mk]
                      // Carry-over = balance of all months that are chronologically BEFORE this one (appear after in the desc-sorted array)
                      const carryOver = group.months.slice(mIdx + 1).reduce(
                        (s, m) => s + group.monthMap[m].reduce((ss, d) => ss + bal(d), 0), 0)
                      // Real linkage via supplier_debt_payments (which check actually settled which debt),
                      // not a due-date guess — a check dated far in the future can still close an old month.
                      const monthDebtIds = new Set(monthDebts.map(d => d.id))
                      const linkedPaymentIds = new Set(
                        debtPayments.filter(dp => monthDebtIds.has(dp.supplier_debt_id) && dp.scheduled_payment_id)
                          .map(dp => dp.scheduled_payment_id!)
                      )
                      const monthPayments = group.suppPayments.filter(p => linkedPaymentIds.has(p.id))
                      const monthDebtTotal = monthDebts.reduce((s, d) => s + d.amount, 0)
                      const monthPaidTotal = monthDebts.reduce((s, d) => s + d.paid, 0)
                      const monthBalance   = monthDebts.reduce((s, d) => s + bal(d), 0)

                      return (
                        <div key={mk} style={{ borderBottom: mIdx < group.months.length - 1 ? '1px solid var(--border)' : 'none', padding: '14px 16px' }}>

                          {/* Month header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                            {monthBalance === 0
                              ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>סגור ✓</span>
                              : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>פתוח</span>}
                          </div>

                          {/* Carry-over notice */}
                          {carryOver > 0 && (
                            <div style={{ padding: '7px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                              ↩ יתרת חוב מחודשים קודמים: {fmt(carryOver)}
                            </div>
                          )}

                          {/* Debt records (invoices/karteset) — clickable for SelectionBar */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: monthPayments.length > 0 ? '10px' : '0' }}>
                            {monthDebts.map(d => {
                              const isSelected = selectedId === d.id
                              return (
                                <div key={d.id} onClick={() => setSelectedId(isSelected ? null : d.id)} style={{
                                  display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
                                  borderRadius: '8px', cursor: 'pointer', flexWrap: 'wrap',
                                  background: isSelected ? '#eff6ff' : d.is_closed ? '#fafafa' : '#f8fafc',
                                  border: `1.5px solid ${isSelected ? '#93c5fd' : 'var(--border)'}`,
                                  opacity: d.is_closed ? 0.7 : 1,
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}><InvoiceCell d={d} /></div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{fmt(d.amount)}</span>
                                    {d.paid > 0 && <span style={{ color: '#16a34a', fontSize: '13px' }}>שולם: {fmt(d.paid)}</span>}
                                    {bal(d) > 0 && <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '13px' }}>יתרה: {fmt(bal(d))}</span>}
                                    <StatusChip debt={d} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* Scheduled payments linked to this month */}
                          {monthPayments.length > 0 && (
                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', marginBottom: '7px' }}>📅 תשלומים מתוזמנים:</div>
                              {monthPayments.map((p, pi) => {
                                const days = daysUntilDate(p.due_date)
                                return (
                                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', fontSize: '13px', borderTop: pi > 0 ? '1px solid #e0f2fe' : 'none', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                      {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                                    </span>
                                    {p.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.description}</span>}
                                    <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{p.due_date}</span>
                                    {p.notes && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.notes}</span>}
                                    <span style={{ marginRight: 'auto' }}>
                                      {p.is_paid
                                        ? <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>✓ שולם</span>
                                        : <span style={{ fontSize: '11px', fontWeight: 600, color: days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : '#2563eb' }}>
                                            {days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'היום!' : `עוד ${days} ימים`}
                                          </span>}
                                    </span>
                                  </div>
                                )
                              })}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                סה&quot;כ: <strong style={{ marginRight: '4px', color: '#0369a1' }}>{fmt(monthPayments.reduce((s, p) => s + p.amount, 0))}</strong>
                              </div>
                            </div>
                          )}

                          {/* Month totals */}
                          <div style={{ display: 'flex', gap: '20px', fontSize: '13px', flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                            <span>חוב חודש: <strong style={{ color: 'var(--text)' }}>{fmt(monthDebtTotal)}</strong></span>
                            {monthPaidTotal > 0 && <span>שולם: <strong style={{ color: '#16a34a' }}>{fmt(monthPaidTotal)}</strong></span>}
                            <span>יתרה: <strong style={{ color: monthBalance > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(monthBalance)}</strong></span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── CALENDAR TAB — all future checks/transfers across all suppliers, by due date ── */}
      {tab === 'calendar' && (() => {
        const upcoming = scheduledPayments.filter(p => !p.is_paid).sort((a, b) => a.due_date.localeCompare(b.due_date))
        const monthGroups: Record<string, ScheduledPayment[]> = {}
        upcoming.forEach(p => {
          const mk = monthKeyOf(p.due_date)
          if (!monthGroups[mk]) monthGroups[mk] = []
          monthGroups[mk].push(p)
        })
        const months = Object.keys(monthGroups).sort()
        const grandTotal = upcoming.reduce((s, p) => s + Number(p.amount), 0)

        if (upcoming.length === 0) return <EmptyState icon="📅" text="אין צ׳קים או תשלומים עתידיים" />

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>סה״כ עתידי לתשלום — כל הספקים</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(grandTotal)}</span>
            </div>

            {months.map(mk => {
              const items = monthGroups[mk]
              const monthTotal = items.reduce((s, p) => s + Number(p.amount), 0)
              return (
                <div key={mk} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  <div style={{ background: '#f1f5f9', borderBottom: '2px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{fmt(monthTotal)}</span>
                  </div>
                  <div>
                    {items.map((p, i) => {
                      const days = daysUntilDate(p.due_date)
                      const supName = suppliers.find(s => s.id === p.supplier_id)?.name
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                            {p.payment_method === 'check' ? "צ'ק" : 'העברה'}{p.check_number ? ` #${p.check_number}` : ''}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: '90px' }}>{supName ?? '—'}</span>
                          <span style={{ fontSize: '13px', flex: 1 }}>{p.description}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.due_date}</span>
                          <span style={{ fontWeight: 700, minWidth: '90px', textAlign: 'left' }}>{fmt(p.amount)}</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : '#2563eb', whiteSpace: 'nowrap' }}>
                            {days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'היום!' : `עוד ${days} ימים`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[
              { label: 'חובות לקוחות פתוחים', value: openCustTotal, color: 'var(--danger)', icon: '💳', sub: `${customerDebts.filter(d => !d.is_closed).length} רשומות` },
              { label: 'חובות לספקים פתוחים', value: openSuppTotal, color: 'var(--warning)', icon: '🏭', sub: `${supplierDebts.filter(d => !d.is_closed).length} רשומות` },
              { label: netOwed >= 0 ? 'חייבים לספקים נטו' : 'חייבים לנו נטו', value: Math.abs(netOwed), color: netOwed >= 0 ? 'var(--danger)' : 'var(--primary)', icon: '📊', sub: netOwed >= 0 ? 'מצב שלילי' : 'מצב חיובי' },
            ].map(c => (
              <div key={c.label} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderTop: `3px solid ${c.color}` }}>
                <div style={{ fontSize: '26px', marginBottom: '8px' }}>{c.icon}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: c.color }}>{fmt(c.value)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700 }}>חייבים גדולים – לקוחות</h3>
              {customerDebts.filter(d => !d.is_closed && bal(d) > 0).sort((a, b) => bal(b) - bal(a)).slice(0, 8).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                  <div><div style={{ fontWeight: 600 }}>{d.name}</div>{d.phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.phone}</div>}</div>
                  <strong style={{ color: 'var(--danger)' }}>{fmt(bal(d))}</strong>
                </div>
              ))}
              {customerDebts.filter(d => !d.is_closed).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>✓ אין חובות פתוחים</div>}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700 }}>חייבים גדולים – ספקים</h3>
              {supplierDebts.filter(d => !d.is_closed && bal(d) > 0).sort((a, b) => bal(b) - bal(a)).slice(0, 8).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{suppliers.find(s => s.id === d.supplier_id)?.name ?? 'לא צוין'}</div>
                    {d.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.description}</div>}
                  </div>
                  <strong style={{ color: 'var(--warning)' }}>{fmt(bal(d))}</strong>
                </div>
              ))}
              {supplierDebts.filter(d => !d.is_closed).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>✓ אין חובות פתוחים</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOMER MODAL ── */}
      {showCustModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCustModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '500px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editCust ? '✏️ עריכת חוב לקוח' : '+ חוב לקוח חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>שם לקוח *<input value={cName} onChange={e => setCName(e.target.value)} placeholder="שם מלא" className="form-input" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>טלפון<input type="tel" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="050-0000000" className="form-input" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>לוחית רישוי<input inputMode="numeric" value={cPlate} onChange={e => setCPlate(e.target.value)} placeholder="12-345-67" className="form-input" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>סכום (₪) *<input type="number" min="0" step="0.01" value={cAmount} onChange={e => setCAmount(e.target.value)} placeholder="0.00" className="form-input" /></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>הערות<textarea value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="הערות על החוב..." className="form-input" style={{ resize: 'vertical', minHeight: '68px' }} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>תאריך *<input type="date" value={cDate} onChange={e => setCDate(e.target.value)} className="form-input" /></label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowCustModal(false)}>ביטול</Button>
              <Button loading={cSaving} onClick={saveCustDebt}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUPPLIER DEBT MODAL (with invoices) ── */}
      {showSuppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSuppModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '560px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editSupp ? '✏️ עריכת חוב לספק' : '+ חוב לספק חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ספק</span>
                    <a href="/suppliers" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>+ הוסף ספק חדש</a>
                  </div>
                  <select value={sSupplier} onChange={e => setSSupplier(e.target.value)} className="form-input">
                    <option value="">— ללא ספק ספציפי —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  תאריך *
                  <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} className="form-input" />
                </label>
              </div>

              {/* Invoice list */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>חשבוניות / כרטסות</span>
                  <button
                    type="button"
                    onClick={addInvoiceLine}
                    style={{ padding: '4px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                  >+ הוסף</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sInvoices.map((inv, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '8px', alignItems: 'center', background: 'var(--bg)', borderRadius: '8px', padding: '10px' }}>
                      {/* Type toggle */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {(['invoice', 'karteset'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateInvoiceLine(i, 'type', t)}
                            style={{
                              padding: '4px 8px', border: '1px solid', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                              borderColor: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--border)',
                              background: inv.type === t ? (t === 'karteset' ? '#ede9fe' : '#e0f2fe') : 'transparent',
                              color: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--text-muted)',
                            }}
                          >{t === 'invoice' ? 'חשבונית' : 'כרטסת'}</button>
                        ))}
                      </div>
                      <input
                        value={inv.number}
                        onChange={e => updateInvoiceLine(i, 'number', e.target.value)}
                        placeholder="מספר חשבונית..."
                        className="form-input" style={{ margin: 0 }}
                      />
                      <input
                        type="number" min="0" step="0.01"
                        value={inv.amount}
                        onChange={e => updateInvoiceLine(i, 'amount', e.target.value)}
                        placeholder="סכום..."
                        className="form-input" style={{ margin: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeInvoiceLine(i)}
                        disabled={sInvoices.length === 1}
                        style={{ padding: '4px 8px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: sInvoices.length === 1 ? 'default' : 'pointer', opacity: sInvoices.length === 1 ? 0.4 : 1 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
                {invoicesTotal > 0 && (
                  <div style={{ textAlign: 'left', marginTop: '8px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
                    סה"כ: {fmt(invoicesTotal)}
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                הערות (אופציונלי)
                <input value={sNotes} onChange={e => setSNotes(e.target.value)} placeholder="פירוט נוסף..." className="form-input" />
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowSuppModal(false)}>ביטול</Button>
              <Button loading={sSaving} onClick={saveSuppDebt}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {payItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPayItem(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '380px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>₪ רשום תשלום</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>
              יתרה: <strong style={{ color: 'var(--danger)' }}>{fmt(payItem.balance)}</strong>
            </div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                סכום תשלום (₪) *
                <input type="number" min="0.01" step="0.01" max={payItem.balance} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" className="form-input" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                תאריך תשלום
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="form-input" />
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setPayItem(null)}>ביטול</Button>
              <Button loading={paySaving} onClick={recordPayment} style={{ background: '#16a34a', borderColor: '#16a34a' }}>✓ אשר תשלום</Button>
            </div>
          </div>
        </div>
      )}
      {/* ── WHATSAPP EDIT MODAL ── */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setWaModal(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', width: 'min(420px, calc(100vw - 32px))', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', direction: 'rtl' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>💬 שלח הודעת ווצאפ</h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>ערוך את הטקסט לפני השליחה</p>
            <textarea
              value={waModal.text}
              onChange={e => setWaModal(m => m ? { ...m, text: e.target.value } : m)}
              rows={5}
              className="form-input" style={{ resize: 'vertical', fontSize: '13px', lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setWaModal(null)}>ביטול</Button>
              <a
                href={waUrl(waModal.phone, waModal.text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaModal(null)}
                style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: '1.5px solid #16a34a', borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                📲 פתח ווצאפ
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
