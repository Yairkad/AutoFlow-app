'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import CallLogModal, { CustomerDebtCall } from './CallLogModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerDebt {
  id: string; tenant_id: string; name: string; phone: string | null
  plate: string | null; amount: number; paid: number; description: string | null
  date: string; due_date: string | null; is_closed: boolean; created_at: string
}

type PaymentMethod = 'מזומן' | 'אשראי' | "צ'ק" | 'העברה'

interface CustomerDebtPayment {
  id: string; customer_debt_id: string; amount: number
  payment_date: string; payment_method: string; reference: string | null
  transfer_verified: boolean | null; verified_date: string | null; created_at: string
}

type Tab    = 'customers' | 'transfers'
type Filter = 'open' | 'closed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)
const bal = (d: { amount: number; paid: number; direction?: 'charge' | 'credit' }) =>
  d.direction === 'credit' ? -Number(d.amount) : Math.max(0, Number(d.amount) - Number(d.paid))

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
  const { profile, loading: profileLoading } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [tab, setTab]       = useState<Tab>('customers')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([])
  const [calls, setCalls]       = useState<CustomerDebtCall[]>([])
  const [payments, setPayments] = useState<CustomerDebtPayment[]>([])

  // Row selection
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
  const [cDueDate, setCDueDate] = useState('')
  const [cSaving, setCsaving] = useState(false)

  // Call log modal
  const [callLogDebtId, setCallLogDebtId] = useState<string | null>(null)

  // Payment modal (customer debts only)
  const [payItem, setPayItem] = useState<{ id: string; balance: number } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate]     = useState(todayISO())
  const [payMethod, setPayMethod] = useState<PaymentMethod>('מזומן')
  const [payReference, setPayReference] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  // Tenant name (for WA messages)
  const [tenantName, setTenantName] = useState('AutoFlow')

  // WhatsApp edit modal
  const [waModal, setWaModal] = useState<{ phone: string; text: string } | null>(null)

  // Transfers-pending-verification tab: show already-verified ones too?
  const [showVerifiedTransfers, setShowVerifiedTransfers] = useState(false)

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
    if (!tid) {
      // Profile context gave up resolving (e.g. no session) — stop spinning instead of hanging forever.
      if (!profileLoading) setLoading(false)
      return
    }
    setLoading(true)
    const [custRes, callsRes, paymentsRes] = await Promise.all([
      supabase.from('customer_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('customer_debt_calls').select('*').eq('tenant_id', tid),
      supabase.from('customer_debt_payments').select('*').eq('tenant_id', tid).order('payment_date', { ascending: false }),
    ])
    if (custRes.data)     setCustomerDebts(custRes.data)
    if (callsRes.data)    setCalls(callsRes.data)
    if (paymentsRes.data) setPayments(paymentsRes.data)
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    setLoading(false)
  }, [supabase, resolveTenant, profile, profileLoading])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_debt_calls' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_debt_payments' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  // ── Customer CRUD ─────────────────────────────────────────────────────────

  const openCustModal = (d?: CustomerDebt) => {
    if (d) {
      setEditCust(d); setCName(d.name); setCPhone(d.phone ?? ''); setCPlate(d.plate ?? '')
      setCAmount(String(d.amount)); setCDesc(d.description ?? ''); setCDate(d.date); setCDueDate(d.due_date ?? '')
    } else {
      setEditCust(null); setCName(''); setCPhone(''); setCPlate(''); setCAmount(''); setCDesc(''); setCDate(todayISO()); setCDueDate('')
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
      description: cDesc.trim() || null, date: cDate, due_date: cDueDate || null,
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

  // ── Payment (customers) ──────────────────────────────────────────────────

  const openPay = (id: string, debtBalance: number) => {
    setPayItem({ id, balance: debtBalance })
    setPayAmount(String(debtBalance.toFixed(2))); setPayDate(todayISO())
    setPayMethod('מזומן'); setPayReference('')
  }

  const recordPayment = async () => {
    if (!payItem || !payAmount) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { showToast('סכום לא תקין', 'error'); return }
    const tid = tenantIdRef.current!
    setPaySaving(true)
    const debt = customerDebts.find(d => d.id === payItem.id)
    if (!debt) { setPaySaving(false); return }
    const newPaid  = Math.min(Number(debt.amount), Number(debt.paid) + amount)
    const isClosed = newPaid >= Number(debt.amount)
    const { error } = await supabase.from('customer_debts').update({ paid: newPaid, is_closed: isClosed }).eq('id', payItem.id)
    if (error) { showToast('שגיאה בתשלום', 'error'); setPaySaving(false); return }
    await supabase.from('customer_debt_payments').insert({
      tenant_id: tid, customer_debt_id: payItem.id, amount,
      payment_date: payDate, payment_method: payMethod,
      reference: payReference.trim() || null,
      transfer_verified: payMethod === 'העברה' ? false : null,
    })
    showToast(isClosed ? 'שולם במלואו ✓' : 'תשלום נרשם ✓', 'success')
    setPaySaving(false); setPayItem(null); loadAll()
  }

  const toggleCustClose = async (id: string, current: boolean) => {
    await supabase.from('customer_debts').update({ is_closed: !current }).eq('id', id)
    loadAll()
  }

  const verifyTransfer = async (id: string) => {
    await supabase.from('customer_debt_payments').update({ transfer_verified: true, verified_date: todayISO() }).eq('id', id)
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

  const openCustTotal = customerDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)
  const pendingTransfers = payments.filter(p => p.payment_method === 'העברה' && !p.transfer_verified)
  const visibleTransfers = payments.filter(p => p.payment_method === 'העברה' && (showVerifiedTransfers || !p.transfer_verified))

  // ── Selected item info (customers) ───────────────────────────────────────

  const selectedCust = selectedId ? customerDebts.find(d => d.id === selectedId) : null

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

  const StatusChip = ({ debt }: { debt: CustomerDebt }) => {
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

  const Toolbar = ({ onAdd }: { onAdd?: () => void }) => (
    <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      {onAdd && <Button onClick={onAdd}>+ הוסף חוב</Button>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <FilterBtn f="open" label="פתוחים" />
        <FilterBtn f="closed" label="סגורים" />
        <FilterBtn f="all" label="הכל" />
      </div>
      <input
        placeholder="חיפוש שם / טלפון / לוחית..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="form-input" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
      />
      <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
        יתרה: <strong style={{ color: 'var(--danger)' }}>{fmt(openCustTotal)}</strong>
      </span>
      <ExcelMenu onExportExcel={exportExcel} />
    </div>
  )

  // Selection action bar (customers only)
  const SelectionBar = () => {
    if (!selectedId || !selectedCust) return null
    const debt = selectedCust
    const waText = `שלום ${debt.name}, תזכורת לגבי יתרת חוב בסך ${fmt(bal(debt))} 🙏\n${tenantName}`

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
          {debt.name}{' · '}<strong>{fmt(bal(debt))}</strong>
        </span>
        {debt.phone && (
          <button
            onClick={() => setWaModal({ phone: debt.phone!, text: waText })}
            style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            💬 ווצאפ תזכורת
          </button>
        )}
        <button
          onClick={() => setCallLogDebtId(selectedId)}
          style={{ padding: '5px 12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          📞 שיחה{calls.filter(c => c.customer_debt_id === selectedId).length > 0 ? ` (${calls.filter(c => c.customer_debt_id === selectedId).length})` : ''}
        </button>
        {!debt.is_closed && bal(debt) > 0 && (
          <button
            onClick={() => openPay(selectedId, bal(debt))}
            style={{ padding: '5px 12px', background: '#f0fdf6', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >₪ שלם</button>
        )}
        <button
          onClick={() => toggleCustClose(selectedId, debt.is_closed)}
          style={{ padding: '5px 10px', background: debt.is_closed ? '#fef2f2' : '#f0fdf6', color: debt.is_closed ? 'var(--danger)' : '#16a34a', border: '1px solid', borderColor: debt.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >{debt.is_closed ? '↩ פתח' : '✓ סגור'}</button>
        <button
          onClick={() => openCustModal(selectedCust)}
          style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >✏️ ערוך</button>
        <button
          onClick={() => deleteCustDebt(selectedId)}
          style={{ padding: '5px 10px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
        >🗑 מחק</button>
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

  // ── Excel / JSON ──────────────────────────────────────────────────────────

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const rows = customerDebts.map(d => ({ שם: d.name, טלפון: d.phone ?? '', לוחית: d.plate ?? '', סכום: d.amount, שולם: d.paid, יתרה: bal(d), תאריך: d.date, 'יעד לתשלום': d.due_date ?? '', סטטוס: d.is_closed ? 'סגור' : 'פתוח', הערה: d.description ?? '' }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חובות לקוחות מזדמנים')
    XLSX.writeFile(wb, 'חובות-לקוחות-מזדמנים.xlsx')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
        iconBg="linear-gradient(135deg,#ef4444,#f87171)"
        iconShadow="#ef444444"
        title="חובות"
        subtitle="לקוחות מזדמנים החייבים כסף, ואימות תשלומים שהתקבלו בהעברה בנקאית"
      />

      {/* Tabs */}
      <div className="scroll-x" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          <TabBtn t="customers" label="💳 לקוחות מזדמנים" count={customerDebts.filter(d => !d.is_closed).length} />
          <TabBtn t="transfers" label="🏦 העברות לאימות" count={pendingTransfers.length} />
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
                    {['שם לקוח', 'טלפון', 'לוחית', 'סכום', 'שולם', 'יתרה', 'תאריך', 'יעד לתשלום', 'סטטוס'].map(h => (
                      <th key={h} style={thSt}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCust.map((d, i) => {
                    const isSelected = selectedId === d.id
                    const isOverdue = !!d.due_date && !d.is_closed && d.due_date < todayISO()
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
                        <td style={{ ...tdSt, whiteSpace: 'nowrap', color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                          {d.due_date ? (isOverdue ? `⚠ ${d.due_date}` : d.due_date) : '—'}
                        </td>
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

      {/* ── TRANSFERS TAB — bank-transfer payments pending verification ── */}
      {tab === 'transfers' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showVerifiedTransfers} onChange={e => setShowVerifiedTransfers(e.target.checked)} />
              הצג גם מאומתות
            </label>
            <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
              ממתינות לאימות: <strong style={{ color: 'var(--danger)' }}>{pendingTransfers.length}</strong>
            </span>
          </div>

          {visibleTransfers.length === 0 ? (
            <EmptyState icon="🏦" text="אין העברות לאימות" />
          ) : (
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['לקוח', 'טלפון', 'סכום', 'תאריך', 'אסמכתא', 'סטטוס', ''].map(h => (
                      <th key={h} style={thSt}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTransfers.sort((a, b) => b.payment_date.localeCompare(a.payment_date)).map(p => {
                    const debt = customerDebts.find(d => d.id === p.customer_debt_id)
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{debt?.name ?? '—'}</td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{debt?.phone || '—'}</td>
                        <td style={{ ...tdSt, fontWeight: 700 }}>{fmt(p.amount)}</td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.payment_date}</td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{p.reference || '—'}</td>
                        <td style={tdSt}>
                          {p.transfer_verified
                            ? <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>✓ אומת{p.verified_date ? ` (${p.verified_date})` : ''}</span>
                            : <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef3c7', color: 'var(--warning)', fontWeight: 600 }}>ממתין</span>}
                        </td>
                        <td style={tdSt}>
                          {!p.transfer_verified && (
                            <button
                              onClick={() => verifyTransfer(p.id)}
                              style={{ padding: '4px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >✓ אומת בחשבון</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>תאריך *<input type="date" value={cDate} onChange={e => setCDate(e.target.value)} className="form-input" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>יעד לתשלום<input type="date" value={cDueDate} onChange={e => setCDueDate(e.target.value)} className="form-input" /></label>
              </div>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowCustModal(false)}>ביטול</Button>
              <Button loading={cSaving} onClick={saveCustDebt}>💾 שמור</Button>
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
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>אמצעי תשלום</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
                  {(['מזומן', 'אשראי', 'העברה', "צ'ק"] as PaymentMethod[]).map(m => (
                    <button key={m} type="button" onClick={() => setPayMethod(m)} style={{
                      padding: '7px 4px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                      border: `1px solid ${payMethod === m ? 'var(--primary)' : 'var(--border)'}`,
                      background: payMethod === m ? '#f0fdf4' : '#f8fafc',
                      color: payMethod === m ? 'var(--primary)' : 'var(--text-muted)',
                    }}>
                      {m === 'מזומן' ? '💵' : m === 'אשראי' ? '💳' : m === "צ'ק" ? '📝' : '🏦'} {m}
                    </button>
                  ))}
                </div>
                {(payMethod === 'העברה' || payMethod === "צ'ק") && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, marginTop: '8px' }}>
                    {payMethod === 'העברה' ? 'מספר אסמכתא' : 'מספר צ׳ק'}
                    <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="אופציונלי" className="form-input" style={{ margin: 0 }} />
                  </label>
                )}
              </div>
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

      <CallLogModal
        open={!!callLogDebtId}
        onClose={() => setCallLogDebtId(null)}
        debtId={callLogDebtId}
        debtName={customerDebts.find(d => d.id === callLogDebtId)?.name ?? ''}
        calls={calls.filter(c => c.customer_debt_id === callLogDebtId)}
        tenantId={tenantIdRef.current ?? ''}
        supabase={supabase}
        showToast={showToast}
        onSaved={loadAll}
      />
    </div>
  )
}
