'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

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

interface Supplier {
  id: string; name: string; phone: string | null; contact_name: string | null
}

type Tab    = 'customers' | 'suppliers' | 'summary'
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

const inputSt: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', background: 'var(--bg)', direction: 'rtl', width: '100%', boxSizing: 'border-box',
}
const btnPrim: React.CSSProperties = {
  padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none',
  borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnSec: React.CSSProperties = {
  padding: '9px 20px', background: 'transparent', color: 'var(--text-muted)',
  border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
}
const thSt: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px',
}
const tdSt: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function DebtsClient() {
  const supabase    = useRef(createClient()).current
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

  // ── Tenant ────────────────────────────────────────────────────────────────

  const resolveTenant = useCallback(async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    if (data) tenantIdRef.current = data.tenant_id
    return tenantIdRef.current
  }, [supabase])

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tid = await resolveTenant()
    if (!tid) return
    setLoading(true)
    const [custRes, suppDebtRes, suppRes, tenantRes] = await Promise.all([
      supabase.from('customer_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('supplier_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name,phone,contact_name').eq('tenant_id', tid).order('name'),
      supabase.from('tenants').select('name').eq('id', tid).single(),
    ])
    if (custRes.data)     setCustomerDebts(custRes.data)
    if (suppDebtRes.data) setSupplierDebts(suppDebtRes.data)
    if (suppRes.data)     setSuppliers(suppRes.data)
    if (tenantRes.data?.name) setTenantName(tenantRes.data.name)
    setLoading(false)
  }, [supabase, resolveTenant])

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
    const table = payItem.type === 'customer' ? 'customer_debts' : 'supplier_debts'
    const debt  = payItem.type === 'customer'
      ? customerDebts.find(d => d.id === payItem.id)
      : supplierDebts.find(d => d.id === payItem.id)
    if (!debt) { setPaySaving(false); return }
    const newPaid  = Math.min(Number(debt.amount), Number(debt.paid) + amount)
    const isClosed = newPaid >= Number(debt.amount)
    const { error } = await supabase.from(table).update({ paid: newPaid, is_closed: isClosed }).eq('id', payItem.id)
    if (error) { showToast('שגיאה בתשלום', 'error'); setPaySaving(false); return }
    showToast(isClosed ? 'שולם במלואו ✓' : 'תשלום נרשם ✓', 'success')
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

  // ── Selected item info ────────────────────────────────────────────────────

  const selectedCust = selectedId ? customerDebts.find(d => d.id === selectedId) : null
  const selectedSupp = selectedId ? supplierDebts.find(d => d.id === selectedId) : null
  const selectedType: 'customer' | 'supplier' | null = selectedCust ? 'customer' : selectedSupp ? 'supplier' : null

  // ── Sub-components ────────────────────────────────────────────────────────

  const TabBtn = ({ t, label }: { t: Tab; label: string }) => (
    <button onClick={() => setTab(t)} style={{
      padding: '10px 20px', border: 'none',
      borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
      background: 'transparent', color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
      fontWeight: tab === t ? 700 : 400, fontSize: '14px', cursor: 'pointer', transition: 'all .15s',
    }}>{label}</button>
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
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>חלקי</span>
    return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>פתוח</span>
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  const Toolbar = ({ onAdd }: { onAdd: () => void }) => (
    <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={onAdd} style={btnPrim}>+ הוסף חוב</button>
      <div style={{ display: 'flex', gap: '6px' }}>
        <FilterBtn f="open" label="פתוחים" />
        <FilterBtn f="closed" label="סגורים" />
        <FilterBtn f="all" label="הכל" />
      </div>
      <input
        placeholder={tab === 'customers' ? 'חיפוש שם / טלפון / לוחית...' : 'חיפוש ספק / תיאור...'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...inputSt, flex: 1, minWidth: '180px', maxWidth: '300px' }}
      />
      <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
        יתרה: <strong style={{ color: 'var(--danger)' }}>{fmt(tab === 'customers' ? openCustTotal : openSuppTotal)}</strong>
      </span>
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
          style={{ padding: '5px 10px', background: debt.is_closed ? '#fef2f2' : '#f0fdf6', color: debt.is_closed ? '#dc2626' : '#16a34a', border: '1px solid', borderColor: debt.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >{debt.is_closed ? '↩ פתח' : '✓ סגור'}</button>
        {/* Edit */}
        <button
          onClick={() => selectedType === 'customer' ? openCustModal(selectedCust!) : openSuppModal(selectedSupp!)}
          style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >✏️ ערוך</button>
        {/* Delete */}
        <button
          onClick={() => selectedType === 'customer' ? deleteCustDebt(selectedId) : deleteSuppDebt(selectedId)}
          style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>💳 חובות</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          מעקב חובות לקוחות וספקים — לחץ על שורה לבחירה ופעולות
        </p>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px', display: 'flex', gap: '2px' }}>
        <TabBtn t="customers" label={`💳 לקוחות (${customerDebts.filter(d => !d.is_closed).length} פתוחים)`} />
        <TabBtn t="suppliers" label={`🏭 ספקים (${supplierDebts.filter(d => !d.is_closed).length} פתוחים)`} />
        <TabBtn t="summary"   label="📊 סיכום" />
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
                        <td style={{ ...tdSt, fontWeight: 700, color: bal(d) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(bal(d))}</td>
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

      {/* ── SUPPLIERS TAB ── */}
      {tab === 'suppliers' && (
        <div>
          <Toolbar onAdd={() => openSuppModal()} />
          <SelectionBar />
          {filteredSupp.length === 0 ? (
            <EmptyState icon="🏭" text={`אין חובות לספקים ${filter === 'open' ? 'פתוחים' : filter === 'closed' ? 'סגורים' : ''}`} />
          ) : (
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['ספק', 'חשבוניות', 'סכום', 'שולם', 'יתרה', 'תאריך', 'סטטוס'].map(h => (
                      <th key={h} style={thSt}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSupp.map((d, i) => {
                    const supp       = suppliers.find(s => s.id === d.supplier_id)
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
                          {supp?.name ?? <span style={{ color: 'var(--text-muted)' }}>לא צוין</span>}
                          {supp?.phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 400 }}>{supp.phone}</div>}
                        </td>
                        <td style={{ ...tdSt, maxWidth: '220px' }}><InvoiceCell d={d} /></td>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{fmt(d.amount)}</td>
                        <td style={{ ...tdSt, color: '#16a34a' }}>{fmt(d.paid)}</td>
                        <td style={{ ...tdSt, fontWeight: 700, color: bal(d) > 0 ? '#dc2626' : '#16a34a' }}>{fmt(bal(d))}</td>
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

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[
              { label: 'חובות לקוחות פתוחים', value: openCustTotal, color: '#dc2626', icon: '💳', sub: `${customerDebts.filter(d => !d.is_closed).length} רשומות` },
              { label: 'חובות לספקים פתוחים', value: openSuppTotal, color: '#d97706', icon: '🏭', sub: `${supplierDebts.filter(d => !d.is_closed).length} רשומות` },
              { label: netOwed >= 0 ? 'חייבים לספקים נטו' : 'חייבים לנו נטו', value: Math.abs(netOwed), color: netOwed >= 0 ? '#dc2626' : '#1a9e5c', icon: '📊', sub: netOwed >= 0 ? 'מצב שלילי' : 'מצב חיובי' },
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
                  <strong style={{ color: '#dc2626' }}>{fmt(bal(d))}</strong>
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
                  <strong style={{ color: '#d97706' }}>{fmt(bal(d))}</strong>
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
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>שם לקוח *<input value={cName} onChange={e => setCName(e.target.value)} placeholder="שם מלא" style={inputSt} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>טלפון<input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="050-0000000" style={inputSt} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>לוחית רישוי<input value={cPlate} onChange={e => setCPlate(e.target.value)} placeholder="12-345-67" style={inputSt} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>סכום (₪) *<input type="number" min="0" step="0.01" value={cAmount} onChange={e => setCAmount(e.target.value)} placeholder="0.00" style={inputSt} /></label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>הערות<textarea value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="הערות על החוב..." style={{ ...inputSt, resize: 'vertical', minHeight: '68px' }} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>תאריך *<input type="date" value={cDate} onChange={e => setCDate(e.target.value)} style={inputSt} /></label>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCustModal(false)} style={btnSec}>ביטול</button>
              <button onClick={saveCustDebt} disabled={cSaving} style={btnPrim}>{cSaving ? 'שומר...' : '💾 שמור'}</button>
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
                  <select value={sSupplier} onChange={e => setSSupplier(e.target.value)} style={inputSt}>
                    <option value="">— ללא ספק ספציפי —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  תאריך *
                  <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} style={inputSt} />
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
                        style={{ ...inputSt, margin: 0 }}
                      />
                      <input
                        type="number" min="0" step="0.01"
                        value={inv.amount}
                        onChange={e => updateInvoiceLine(i, 'amount', e.target.value)}
                        placeholder="סכום..."
                        style={{ ...inputSt, margin: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeInvoiceLine(i)}
                        disabled={sInvoices.length === 1}
                        style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: sInvoices.length === 1 ? 'default' : 'pointer', opacity: sInvoices.length === 1 ? 0.4 : 1 }}
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
                <input value={sNotes} onChange={e => setSNotes(e.target.value)} placeholder="פירוט נוסף..." style={inputSt} />
              </label>
            </div>
            <div className="sticky-actions">
              <button onClick={() => setShowSuppModal(false)} style={btnSec}>ביטול</button>
              <button onClick={saveSuppDebt} disabled={sSaving} style={btnPrim}>{sSaving ? 'שומר...' : '💾 שמור'}</button>
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
              יתרה: <strong style={{ color: '#dc2626' }}>{fmt(payItem.balance)}</strong>
            </div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                סכום תשלום (₪) *
                <input type="number" min="0.01" step="0.01" max={payItem.balance} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" style={inputSt} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                תאריך תשלום
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inputSt} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPayItem(null)} style={btnSec}>ביטול</button>
              <button onClick={recordPayment} disabled={paySaving} style={{ ...btnPrim, background: '#16a34a' }}>
                {paySaving ? 'רושם...' : '✓ אשר תשלום'}
              </button>
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
              style={{ ...inputSt, resize: 'vertical', fontSize: '13px', lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setWaModal(null)} style={btnSec}>ביטול</button>
              <a
                href={waUrl(waModal.phone, waModal.text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaModal(null)}
                style={{ ...btnPrim, background: '#16a34a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
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
