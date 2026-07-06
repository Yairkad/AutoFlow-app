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
import ScheduledPaymentsModal from '@/components/expenses/ScheduledPaymentsModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = 'charge' | 'credit'

interface InvoiceEntry {
  type: 'invoice' | 'karteset'
  number: string
  amount: string
  date: string
  direction: Direction
}

interface SupplierDebt {
  id: string; tenant_id: string; supplier_id: string | null
  amount: number; paid: number; description: string | null
  date: string; is_closed: boolean; created_at: string
  doc_type: string | null; doc_number: string | null
  direction: Direction
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

type Tab    = 'byMonth' | 'calendar'
type Filter = 'open' | 'closed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)
const bal = (d: { amount: number; paid: number; direction: Direction }) =>
  d.direction === 'credit' ? -Number(d.amount) : Math.max(0, Number(d.amount) - Number(d.paid))
const EMPTY_INV = (): InvoiceEntry => ({ type: 'invoice', number: '', amount: '', date: todayISO(), direction: 'charge' })

const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('972')) digits = digits.startsWith('0') ? '972' + digits.slice(1) : '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

const monthKeyOf = (iso: string) => iso.slice(0, 7)
const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const fmtMonth = (key: string) => { const [y, m] = key.split('-'); return `${HEB_MONTHS[parseInt(m) - 1]} ${y}` }
const daysUntilDate = (iso: string) => { const t = new Date(); t.setHours(0,0,0,0); const d = new Date(iso + 'T00:00:00'); d.setHours(0,0,0,0); return Math.round((d.getTime()-t.getTime())/86400000) }

// ── Shared styles ─────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '11px',
  background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px',
}
const tdSt: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierTrackingClient() {
  const supabase    = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [tab, setTab]       = useState<Tab>('byMonth')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [supplierDebts, setSupplierDebts] = useState<SupplierDebt[]>([])
  const [suppliers, setSuppliers]         = useState<Supplier[]>([])
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [debtPayments, setDebtPayments]   = useState<SupplierDebtPayment[]>([])
  const [expenseCats, setExpenseCats]     = useState<string[]>(['ספקים', 'אחר'])
  const autoExpenseDoneRef = useRef(false)

  // Row selection
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Supplier debt form (each line = its own invoice/credit)
  const [showSuppModal, setShowSuppModal] = useState(false)
  const [editSupp, setEditSupp]           = useState<SupplierDebt | null>(null)
  const [sSupplier, setSSupplier] = useState('')
  const [sNotes, setSNotes]       = useState('')
  const [sInvoices, setSInvoices] = useState<InvoiceEntry[]>([EMPTY_INV()])
  const [sSaving, setSsaving]     = useState(false)

  // Payment modal
  const [payItem, setPayItem]     = useState<{ id: string; balance: number } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate]     = useState(todayISO())
  const [paySaving, setPaySaving] = useState(false)

  // Tenant name (for WA messages)
  const [tenantName, setTenantName] = useState('AutoFlow')
  const [waModal, setWaModal] = useState<{ phone: string; text: string } | null>(null)

  // Scheduled payments (checks) modal
  const [schedModal, setSchedModal] = useState(false)

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
    const [suppDebtRes, suppRes, paymentsRes, debtPaymentsRes, catRes] = await Promise.all([
      supabase.from('supplier_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name,phone,contact_name').eq('tenant_id', tid).order('name'),
      supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date'),
      supabase.from('supplier_debt_payments').select('*').eq('tenant_id', tid),
      supabase.from('expense_categories').select('name').eq('tenant_id', tid).order('created_at'),
    ])
    if (suppDebtRes.data) setSupplierDebts(suppDebtRes.data)
    if (suppRes.data)     setSuppliers(suppRes.data)
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    const payments: ScheduledPayment[] = paymentsRes.data ?? []
    setScheduledPayments(payments)
    setDebtPayments(debtPaymentsRes.data ?? [])
    if (catRes.data && catRes.data.length > 0) setExpenseCats(catRes.data.map(r => r.name))
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
  useEffect(() => { setSelectedId(null); setFilter('open'); setSearch('') }, [tab])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // Deep-link: ?open=<supplierId>
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (didAutoOpen.current || loading) return
    didAutoOpen.current = true
    const openId = new URLSearchParams(window.location.search).get('open')
    if (openId && suppliers.some(s => s.id === openId)) setSearch(suppliers.find(s => s.id === openId)!.name)
  }, [loading, suppliers])

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('supplier-tracking-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_payments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debt_payments' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  // ── Supplier debt CRUD ────────────────────────────────────────────────────

  const openSuppModal = (d?: SupplierDebt) => {
    if (d) {
      setEditSupp(d); setSSupplier(d.supplier_id ?? ''); setSNotes(d.description ?? '')
      const existing = Array.isArray(d.invoices) && d.invoices.length > 0
        ? d.invoices.map(i => ({ type: i.type as 'invoice' | 'karteset', number: i.number, amount: String(i.amount), date: d.date, direction: d.direction }))
        : d.doc_number
          ? [{ type: (d.doc_type ?? 'invoice') as 'invoice' | 'karteset', number: d.doc_number, amount: String(d.amount), date: d.date, direction: d.direction }]
          : [{ ...EMPTY_INV(), date: d.date, direction: d.direction }]
      setSInvoices(existing)
    } else {
      setEditSupp(null); setSSupplier(''); setSNotes(''); setSInvoices([EMPTY_INV()])
    }
    setShowSuppModal(true)
  }

  const addInvoiceLine = () => setSInvoices(prev => [...prev, EMPTY_INV()])
  const removeInvoiceLine = (i: number) => setSInvoices(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  const updateInvoiceLine = (i: number, field: keyof InvoiceEntry, val: string) =>
    setSInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, [field]: val } : inv))

  const invoicesTotal = sInvoices.reduce((s, inv) => s + (inv.direction === 'credit' ? -1 : 1) * (parseFloat(inv.amount) || 0), 0)

  const saveSuppDebt = async () => {
    const validLines = sInvoices.filter(i => i.number.trim() || parseFloat(i.amount) > 0)
    if (validLines.length === 0) { showToast('נא למלא לפחות שורה אחת', 'error'); return }
    if (validLines.some(l => !l.date)) { showToast('נא לבחור תאריך לכל שורה', 'error'); return }
    const tid = tenantIdRef.current!
    setSsaving(true)

    if (editSupp) {
      // Editing an existing row (possibly a legacy multi-invoice bundle) — single-row update
      const invoicesData = validLines.map(i => ({ type: i.type, number: i.number.trim(), amount: parseFloat(i.amount) || 0 }))
      const total = invoicesData.reduce((s, i) => s + i.amount, 0)
      const row = {
        supplier_id: sSupplier || null,
        amount: total || parseFloat(validLines[0]?.amount) || 0,
        description: sNotes.trim() || null,
        date: validLines[0]?.date || todayISO(),
        doc_type: validLines[0]?.type ?? 'invoice',
        doc_number: validLines[0]?.number.trim() || null,
        direction: validLines[0]?.direction ?? 'charge',
        invoices: invoicesData,
      }
      const { error } = await supabase.from('supplier_debts').update(row).eq('id', editSupp.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setSsaving(false); return }
      showToast('עודכן ✓', 'success')
    } else {
      // New entry — bulk insert one independent row per line, each its own date/direction
      const rows = validLines.map(l => ({
        id: crypto.randomUUID(), tenant_id: tid,
        supplier_id: sSupplier || null,
        amount: parseFloat(l.amount) || 0,
        description: sNotes.trim() || null,
        date: l.date,
        doc_type: l.type,
        doc_number: l.number.trim() || null,
        direction: l.direction,
        invoices: [],
        paid: 0,
        is_closed: l.direction === 'credit',
      }))
      const { error } = await supabase.from('supplier_debts').insert(rows)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSsaving(false); return }
      showToast(`נשמרו ${rows.length} רשומות ✓`, 'success')
    }
    setSsaving(false); setShowSuppModal(false); setSelectedId(null); loadAll()
  }

  const deleteSuppDebt = async (id: string) => {
    if (!confirm('למחוק רשומה זו?')) return
    await supabase.from('supplier_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); setSelectedId(null); loadAll()
  }

  const addDebtForSupplier = (suppId: string) => {
    setEditSupp(null); setSSupplier(suppId); setSNotes(''); setSInvoices([EMPTY_INV()])
    setShowSuppModal(true)
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  const openPay = (id: string, debtBalance: number) => {
    setPayItem({ id, balance: debtBalance })
    setPayAmount(String(debtBalance.toFixed(2))); setPayDate(todayISO())
  }

  const recordPayment = async () => {
    if (!payItem || !payAmount) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { showToast('סכום לא תקין', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return
    setPaySaving(true)
    const { error } = await reconcileSupplierPayment(supabase, tid, [{ supplier_debt_id: payItem.id, amount }], null)
    if (error) { showToast('שגיאה בתשלום: ' + error, 'error'); setPaySaving(false); return }
    showToast('תשלום נרשם ✓', 'success')
    setPaySaving(false); setPayItem(null); loadAll()
  }

  const toggleClose = async (id: string, current: boolean) => {
    await supabase.from('supplier_debts').update({ is_closed: !current }).eq('id', id)
    loadAll()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  const openSuppTotal = supplierDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)

  // ── Selected item info ────────────────────────────────────────────────────

  const selectedSupp = selectedId ? supplierDebts.find(d => d.id === selectedId) : null

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

  const StatusChip = ({ debt }: { debt: SupplierDebt }) => {
    if (debt.direction === 'credit')
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>זיכוי</span>
    if (debt.is_closed)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>שולם ✓</span>
    if (Number(debt.paid) > 0)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef3c7', color: 'var(--warning)', fontWeight: 600 }}>חלקי</span>
    return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>חיוב</span>
  }

  const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '14px' }}>{text}</div>
    </div>
  )

  // ── Excel ─────────────────────────────────────────────────────────────────

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    if (tab === 'byMonth') {
      const rows = supplierDebts.map(d => ({
        ספק: suppliers.find(s => s.id === d.supplier_id)?.name ?? '', מספר: d.doc_number ?? '',
        סוג: d.direction === 'credit' ? 'זיכוי' : 'חיוב', סכום: d.amount, שולם: d.paid, יתרה: bal(d),
        תאריך: d.date, סטטוס: d.is_closed ? 'סגור' : 'פתוח', תיאור: d.description ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חשבוניות וזיכויים')
    } else {
      const rows = scheduledPayments.filter(p => !p.is_paid).map(p => ({
        ספק: suppliers.find(s => s.id === p.supplier_id)?.name ?? '', תיאור: p.description, סכום: p.amount,
        'תאריך פירעון': p.due_date, אמצעי: p.payment_method === 'check' ? "צ'ק" : 'העברה', 'מספר צ׳ק': p.check_number ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'יומן צ׳קים')
    }
    XLSX.writeFile(wb, 'מעקב-ספקים.xlsx')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
        iconBg="linear-gradient(135deg,#0369a1,#38bdf8)"
        iconShadow="#0369a144"
        title="מעקב ספקים"
        subtitle="חשבוניות, זיכויים, ושיבוץ צ'קים לפי חודש"
      />

      {/* Tabs */}
      <div className="scroll-x" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          <TabBtn t="byMonth"  label="🏭 לפי ספק" />
          <TabBtn t="calendar" label="📅 יומן צ׳קים" count={scheduledPayments.filter(p => !p.is_paid).length} />
        </div>
      </div>

      {/* ── BY-MONTH TAB ── */}
      {tab === 'byMonth' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => openSuppModal()}>+ הוסף חשבונית/זיכוי</Button>
            <Button variant="secondary" onClick={() => setSchedModal(true)}>📝 צ׳ק / סדרה לספק</Button>
            <div style={{ display: 'flex', gap: '6px' }}>
              <FilterBtn f="open" label="פתוחים" />
              <FilterBtn f="closed" label="סגורים" />
              <FilterBtn f="all" label="הכל" />
            </div>
            <input
              placeholder="חיפוש ספק / תיאור..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
            />
            <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
              יתרה כוללת: <strong style={{ color: 'var(--danger)' }}>{fmt(openSuppTotal)}</strong>
            </span>
            <ExcelMenu onExportExcel={exportExcel} />
          </div>

          {/* Selection action bar */}
          {selectedId && selectedSupp && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>✓ שורה נבחרה</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
                {suppliers.find(s => s.id === selectedSupp.supplier_id)?.name ?? 'ללא ספק'} · <strong>{fmt(bal(selectedSupp))}</strong>
              </span>
              {suppliers.find(s => s.id === selectedSupp.supplier_id)?.phone && (
                <button
                  onClick={() => {
                    const supp = suppliers.find(s => s.id === selectedSupp.supplier_id)!
                    setWaModal({ phone: supp.phone!, text: `שלום ${supp.name}, ברצוני לבדוק חוב בסך ${fmt(bal(selectedSupp))}.\nתודה!\n${tenantName}` })
                  }}
                  style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >💬 ווצאפ</button>
              )}
              {!selectedSupp.is_closed && bal(selectedSupp) > 0 && selectedSupp.direction === 'charge' && (
                <button onClick={() => openPay(selectedId, bal(selectedSupp))} style={{ padding: '5px 12px', background: '#f0fdf6', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>₪ שלם</button>
              )}
              <button onClick={() => toggleClose(selectedId, selectedSupp.is_closed)} style={{ padding: '5px 10px', background: selectedSupp.is_closed ? '#fef2f2' : '#f0fdf6', color: selectedSupp.is_closed ? 'var(--danger)' : '#16a34a', border: '1px solid', borderColor: selectedSupp.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{selectedSupp.is_closed ? '↩ פתח' : '✓ סגור'}</button>
              <button onClick={() => openSuppModal(selectedSupp)} style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>✏️ ערוך</button>
              <button onClick={() => deleteSuppDebt(selectedId)} style={{ padding: '5px 10px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>🗑 מחק</button>
              <button onClick={() => setSelectedId(null)} style={{ padding: '5px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {(() => {
            const allSuppIds = [...new Set(supplierDebts.map(d => d.supplier_id))]
            const groups = allSuppIds.map(sid => {
              const debts = supplierDebts.filter(d => d.supplier_id === sid)
              const supp = suppliers.find(s => s.id === sid)
              const totalBal = debts.reduce((s, d) => s + bal(d), 0)

              if (search.trim()) {
                const q = search.toLowerCase()
                const nameMatch = (supp?.name ?? '').toLowerCase().includes(q)
                const descMatch = debts.some(d => d.description?.toLowerCase().includes(q))
                if (!nameMatch && !descMatch) return null
              }
              if (filter === 'open'   && totalBal === 0) return null
              if (filter === 'closed' && totalBal > 0)  return null

              const monthMap: Record<string, SupplierDebt[]> = {}
              debts.forEach(d => {
                const mk = monthKeyOf(d.date)
                if (!monthMap[mk]) monthMap[mk] = []
                monthMap[mk].push(d)
              })
              const months = Object.keys(monthMap).sort().reverse()
              const suppPayments = scheduledPayments.filter(p => p.supplier_id === sid)

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
              <EmptyState icon="🏭" text={`אין רשומות ${filter === 'open' ? 'פתוחות' : filter === 'closed' ? 'סגורות' : ''}`} />
            )

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groups.map(group => (
                  <div key={group.sid ?? 'none'} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

                    <div style={{ background: '#f1f5f9', borderBottom: '2px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>🏭 {group.supp?.name ?? 'ללא ספק'}</span>
                      {group.supp?.phone && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{group.supp.phone}</span>}
                      <span style={{ marginRight: 'auto', fontSize: '14px', fontWeight: 700, color: group.totalBal > 0 ? 'var(--danger)' : '#16a34a' }}>
                        יתרה כוללת: {fmt(group.totalBal)}
                      </span>
                      {group.sid && (
                        <button onClick={() => addDebtForSupplier(group.sid!)}
                          style={{ padding: '4px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          + הוסף
                        </button>
                      )}
                    </div>

                    {group.unlinkedPayments.length > 0 && (
                      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 16px', fontSize: '12px', color: '#92400e' }}>
                        ⚠ {group.unlinkedPayments.length} צ׳קים/תשלומים לספק זה לא שובצו מול חודש ספציפי:{' '}
                        {group.unlinkedPayments.map(p => `${fmt(p.amount)} (${p.due_date})`).join(', ')}
                      </div>
                    )}

                    {group.months.map((mk, mIdx) => {
                      const monthDebts = group.monthMap[mk]
                      const carryOver = group.months.slice(mIdx + 1).reduce(
                        (s, m) => s + group.monthMap[m].reduce((ss, d) => ss + bal(d), 0), 0)
                      const monthDebtIds = new Set(monthDebts.map(d => d.id))
                      const linkedPaymentIds = new Set(
                        debtPayments.filter(dp => monthDebtIds.has(dp.supplier_debt_id) && dp.scheduled_payment_id)
                          .map(dp => dp.scheduled_payment_id!)
                      )
                      const monthPayments = group.suppPayments.filter(p => linkedPaymentIds.has(p.id))
                      const monthChargeTotal = monthDebts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
                      const monthCreditTotal = monthDebts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
                      const monthNetTotal    = monthChargeTotal - monthCreditTotal
                      const monthPaidTotal   = monthDebts.reduce((s, d) => s + Number(d.paid), 0)
                      const monthBalance     = monthDebts.reduce((s, d) => s + bal(d), 0)

                      return (
                        <div key={mk} style={{ borderBottom: mIdx < group.months.length - 1 ? '1px solid var(--border)' : 'none', padding: '14px 16px' }}>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                            {monthBalance <= 0
                              ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>סגור ✓</span>
                              : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>פתוח</span>}
                          </div>

                          {carryOver !== 0 && (
                            <div style={{ padding: '7px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                              ↩ יתרה מחודשים קודמים: {fmt(carryOver)}
                            </div>
                          )}

                          {/* Invoices/credits table */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={thSt}>מספר חשבונית</th>
                                <th style={thSt}>תאריך</th>
                                <th style={thSt}>סוג</th>
                                <th style={{ ...thSt, textAlign: 'left' }}>סכום</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monthDebts.flatMap(d => {
                                const items = Array.isArray(d.invoices) && d.invoices.length > 0
                                  ? d.invoices
                                  : [{ type: d.doc_type ?? 'invoice', number: d.doc_number ?? '', amount: Number(d.amount) }]
                                return items.map((item, idx) => (
                                  <tr
                                    key={`${d.id}-${idx}`}
                                    onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                                    className="tr-hover"
                                    style={{ cursor: 'pointer', background: selectedId === d.id ? '#eff6ff' : d.is_closed && d.direction === 'charge' ? '#fafafa' : undefined }}
                                  >
                                    <td style={tdSt}>{item.number ? `#${item.number}` : '—'}</td>
                                    <td style={{ ...tdSt, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.date}</td>
                                    <td style={tdSt}><StatusChip debt={d} /></td>
                                    <td style={{ ...tdSt, textAlign: 'left', fontWeight: 700, color: d.direction === 'credit' ? 'var(--danger)' : 'var(--text)' }}>
                                      {d.direction === 'credit' ? '−' : ''}{fmt(item.amount)}
                                    </td>
                                  </tr>
                                ))
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                                <td colSpan={4} style={{ padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    <span>סה&quot;כ חיוב: <strong style={{ color: 'var(--text)' }}>{fmt(monthChargeTotal)}</strong></span>
                                    {monthCreditTotal > 0 && <span>סה&quot;כ זיכוי: <strong style={{ color: 'var(--danger)' }}>{fmt(monthCreditTotal)}</strong></span>}
                                    <span>נטו: <strong style={{ color: 'var(--text)' }}>{fmt(monthNetTotal)}</strong></span>
                                    {monthPaidTotal > 0 && <span>שולם: <strong style={{ color: '#16a34a' }}>{fmt(monthPaidTotal)}</strong></span>}
                                    <span>יתרה: <strong style={{ color: monthBalance > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(monthBalance)}</strong></span>
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          </table>

                          {monthPayments.length > 0 && (
                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', marginBottom: '7px' }}>📅 תשלומים מתוזמנים:</div>
                              {monthPayments.map((p, pi) => {
                                const days = daysUntilDate(p.due_date)
                                return (
                                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', fontSize: '13px', borderTop: pi > 0 ? '1px solid #e0f2fe' : 'none', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                      {p.payment_method === 'check' ? "צ'ק" : 'העברה'}{p.check_number ? ` #${p.check_number}` : ''}
                                    </span>
                                    {p.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.description}</span>}
                                    <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{p.due_date}</span>
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
                            </div>
                          )}
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

      {/* ── CHECKS CALENDAR TAB ── */}
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

        return (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <Button variant="secondary" onClick={() => setSchedModal(true)}>📝 צ׳ק / סדרה לספק</Button>
              <ExcelMenu onExportExcel={exportExcel} />
            </div>
            {upcoming.length === 0 ? (
              <EmptyState icon="📅" text="אין צ׳קים או תשלומים עתידיים" />
            ) : (
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
            )}
          </div>
        )
      })()}

      {/* ── SUPPLIER DEBT MODAL ── */}
      {showSuppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSuppModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '620px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editSupp ? '✏️ עריכת רשומה' : '+ חשבונית/זיכוי חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>חשבוניות / זיכויים</span>
                  {!editSupp && (
                    <button type="button" onClick={addInvoiceLine} style={{ padding: '4px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>+ הוסף שורה</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sInvoices.map((inv, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['invoice', 'karteset'] as const).map(t => (
                            <button key={t} type="button" onClick={() => updateInvoiceLine(i, 'type', t)} style={{
                              padding: '4px 8px', border: '1px solid', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                              borderColor: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--border)',
                              background: inv.type === t ? (t === 'karteset' ? '#ede9fe' : '#e0f2fe') : 'transparent',
                              color: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--text-muted)',
                            }}>{t === 'invoice' ? 'חשבונית' : 'כרטסת'}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['charge', 'credit'] as const).map(dir => (
                            <button key={dir} type="button" onClick={() => updateInvoiceLine(i, 'direction', dir)} style={{
                              padding: '4px 10px', border: '1px solid', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                              borderColor: inv.direction === dir ? (dir === 'credit' ? 'var(--danger)' : 'var(--primary)') : 'var(--border)',
                              background: inv.direction === dir ? (dir === 'credit' ? '#fef2f2' : '#f0fdf4') : 'transparent',
                              color: inv.direction === dir ? (dir === 'credit' ? 'var(--danger)' : 'var(--primary)') : 'var(--text-muted)',
                            }}>{dir === 'charge' ? 'חיוב' : 'זיכוי'}</button>
                          ))}
                        </div>
                        {!editSupp && (
                          <button type="button" onClick={() => removeInvoiceLine(i)} disabled={sInvoices.length === 1}
                            style={{ padding: '4px 8px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: sInvoices.length === 1 ? 'default' : 'pointer', opacity: sInvoices.length === 1 ? 0.4 : 1 }}
                          >✕</button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <input value={inv.number} onChange={e => updateInvoiceLine(i, 'number', e.target.value)} placeholder="מספר חשבונית..." className="form-input" style={{ margin: 0 }} />
                        <input type="number" min="0" step="0.01" value={inv.amount} onChange={e => updateInvoiceLine(i, 'amount', e.target.value)} placeholder="סכום..." className="form-input" style={{ margin: 0 }} />
                        <input type="date" value={inv.date} onChange={e => updateInvoiceLine(i, 'date', e.target.value)} className="form-input" style={{ margin: 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {invoicesTotal !== 0 && (
                  <div style={{ textAlign: 'left', marginTop: '8px', fontSize: '14px', fontWeight: 700, color: invoicesTotal < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                    סה&quot;כ נטו: {fmt(invoicesTotal)}
                  </div>
                )}
                {!editSupp && sInvoices.length > 1 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>כל שורה תישמר כרשומה עצמאית משלה, עם התאריך והסוג שבחרת.</div>
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
                <input type="number" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" className="form-input" />
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

      {/* ── WHATSAPP MODAL ── */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setWaModal(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', width: 'min(420px, calc(100vw - 32px))', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', direction: 'rtl' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>💬 שלח הודעת ווצאפ</h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>ערוך את הטקסט לפני השליחה</p>
            <textarea value={waModal.text} onChange={e => setWaModal(m => m ? { ...m, text: e.target.value } : m)} rows={5} className="form-input" style={{ resize: 'vertical', fontSize: '13px', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setWaModal(null)}>ביטול</Button>
              <a href={waUrl(waModal.phone, waModal.text)} target="_blank" rel="noopener noreferrer" onClick={() => setWaModal(null)}
                style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: '1.5px solid #16a34a', borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >📲 פתח ווצאפ</a>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULED PAYMENTS (CHECKS) MODAL ── */}
      {tenantIdRef.current && (
        <ScheduledPaymentsModal
          open={schedModal}
          onClose={() => setSchedModal(false)}
          suppliers={suppliers}
          tenantId={tenantIdRef.current}
          supabase={supabase}
          onRefresh={loadAll}
          showToast={showToast}
          expenseCats={expenseCats}
        />
      )}
    </div>
  )
}
