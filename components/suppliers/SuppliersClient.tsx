'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string
  tenant_id: string
  name: string
  category: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account: string | null
  bank_account_holder: string | null
  created_at: string
}

interface SupplierDebt {
  id: string
  supplier_id: string | null
  amount: number
  paid: number
  description: string | null
  date: string
  is_closed: boolean
  doc_type: string | null
  doc_number: string | null
  invoices: InvoiceEntry[] | null
}

interface InvoiceEntry {
  type: 'invoice' | 'karteset'
  number: string
  amount: number
  description?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPLIER_CATEGORIES = [
  'חלפים', 'צמיגים', 'שירות ותחזוקה', 'גרר / חילוץ', 'ביטוח',
  'עיצוב / טיפול חיצוני', 'טכנולוגיה / תוכנה', 'שיווק ופרסום', 'אחר',
]

const ISRAELI_BANKS: { name: string; code: string }[] = [
  { name: 'בנק לאומי',                   code: '10' },
  { name: 'בנק דיסקונט',                 code: '11' },
  { name: 'בנק הפועלים',                 code: '12' },
  { name: 'בנק אגוד',                    code: '13' },
  { name: 'בנק אוצר החייל',              code: '14' },
  { name: 'בנק מרכנתיל דיסקונט',         code: '17' },
  { name: 'בנק מזרחי טפחות',             code: '20' },
  { name: 'סיטיבנק',                     code: '22' },
  { name: 'HSBC',                        code: '23' },
  { name: 'בנק יהב',                     code: '04' },
  { name: 'בנק הדואר',                   code: '09' },
  { name: 'בנק ירושלים',                 code: '54' },
  { name: 'הבנק הבינלאומי הראשון',        code: '31' },
  { name: 'בנק פועלי אגודת ישראל',        code: '40' },
  { name: 'ONE ZERO',                    code: '39' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'var(--bg)',
  direction: 'rtl',
  width: '100%',
  boxSizing: 'border-box',
}

const btnPrim: React.CSSProperties = {
  padding: '9px 20px',
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSec: React.CSSProperties = {
  padding: '9px 20px',
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
}

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const bal = (d: { amount: number; paid: number }) =>
  Math.max(0, Number(d.amount) - Number(d.paid))

// Format phone → WhatsApp URL
const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) { /* already international */ }
  else if (digits.startsWith('0')) digits = '972' + digits.slice(1)
  else digits = '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuppliersClient() {
  const supabase = useRef(createClient()).current
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editMode, setEditMode] = useState(false)  // manage mode (show edit/delete)

  // Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [debts, setDebts]         = useState<SupplierDebt[]>([])

  // Detail panel
  const [selected, setSelected] = useState<Supplier | null>(null)

  // Supplier form
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem]   = useState<Supplier | null>(null)
  const [fName, setFName]         = useState('')
  const [fContact, setFContact]   = useState('')
  const [fPhone, setFPhone]       = useState('')
  const [fEmail, setFEmail]       = useState('')
  const [fAddress, setFAddress]   = useState('')
  const [fNotes, setFNotes]       = useState('')
  const [fCategory, setFCategory]             = useState('')
  const [fBankName, setFBankName]             = useState('')
  const [fBankBranch, setFBankBranch]         = useState('')
  const [fBankAccount, setFBankAccount]       = useState('')
  const [fBankHolder, setFBankHolder]         = useState('')
  const [showBankDrop, setShowBankDrop]       = useState(false)
  const [saving, setSaving]       = useState(false)

  // ── Tenant ─────────────────────────────────────────────────────────────────

  const resolveTenant = useCallback(async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    if (data) tenantIdRef.current = data.tenant_id
    return tenantIdRef.current
  }, [supabase])

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tid = await resolveTenant()
    if (!tid) return
    setLoading(true)

    const [suppRes, debtRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('tenant_id', tid).order('name'),
      supabase.from('supplier_debts')
        .select('id,supplier_id,amount,paid,description,date,is_closed,doc_type,doc_number,invoices')
        .eq('tenant_id', tid),
    ])

    if (suppRes.data) setSuppliers(suppRes.data)
    if (debtRes.data) setDebts(debtRes.data)
    setLoading(false)
  }, [supabase, resolveTenant])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('suppliers-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debts' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  // ── Supplier CRUD ─────────────────────────────────────────────────────────

  const openModal = (s?: Supplier) => {
    if (s) {
      setEditItem(s)
      setFName(s.name); setFCategory(s.category ?? ''); setFContact(s.contact_name ?? ''); setFPhone(s.phone ?? '')
      setFEmail(s.email ?? ''); setFAddress(s.address ?? ''); setFNotes(s.notes ?? '')
      setFBankName(s.bank_name ?? ''); setFBankBranch(s.bank_branch ?? '')
      setFBankAccount(s.bank_account ?? ''); setFBankHolder(s.bank_account_holder ?? '')
    } else {
      setEditItem(null)
      setFName(''); setFCategory(''); setFContact(''); setFPhone('')
      setFEmail(''); setFAddress(''); setFNotes('')
      setFBankName(''); setFBankBranch(''); setFBankAccount(''); setFBankHolder('')
    }
    setShowBankDrop(false)
    setShowModal(true)
  }

  const saveSupplier = async () => {
    if (!fName.trim()) { showToast('נא להזין שם ספק', 'error'); return }
    const tid = tenantIdRef.current!
    setSaving(true)
    const row = {
      tenant_id: tid,
      name: fName.trim(),
      category: fCategory.trim() || null,
      contact_name: fContact.trim() || null,
      phone: fPhone.trim() || null,
      email: fEmail.trim() || null,
      address: fAddress.trim() || null,
      notes: fNotes.trim() || null,
      bank_name: fBankName.trim() || null,
      bank_branch: fBankBranch.trim() || null,
      bank_account: fBankAccount.trim() || null,
      bank_account_holder: fBankHolder.trim() || null,
    }
    if (editItem) {
      const { error } = await supabase.from('suppliers').update(row).eq('id', editItem.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setSaving(false); return }
      showToast('עודכן ✓', 'success')
      if (selected?.id === editItem.id) setSelected({ ...editItem, ...row })
    } else {
      const { error } = await supabase.from('suppliers').insert({ ...row, id: crypto.randomUUID() })
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      showToast('ספק נוסף ✓', 'success')
    }
    setSaving(false); setShowModal(false); loadAll()
  }

  const deleteSupplier = async (s: Supplier) => {
    if (!confirm(`למחוק את הספק "${s.name}"?\nחובות המקושרים לספק זה לא יימחקו.`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) { showToast('שגיאה במחיקה', 'error'); return }
    showToast('נמחק', 'success')
    if (selected?.id === s.id) setSelected(null)
    loadAll()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = suppliers.filter(s =>
    !search.trim() ||
    s.name.includes(search) ||
    (s.phone?.includes(search) ?? false) ||
    (s.contact_name?.includes(search) ?? false)
  )

  const suppDebts      = (suppId: string) => debts.filter(d => d.supplier_id === suppId)
  const totalDebt      = (suppId: string) => suppDebts(suppId).filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)
  const openDebtsCount = (suppId: string) => suppDebts(suppId).filter(d => !d.is_closed).length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  const selectedDebts     = selected ? suppDebts(selected.id) : []
  const selectedOpenTotal = selected ? totalDebt(selected.id) : 0

  // ── Excel / JSON ───────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = suppliers.map(s => ({ שם: s.name, קטגוריה: s.category ?? '', 'איש קשר': s.contact_name ?? '', טלפון: s.phone ?? '', מייל: s.email ?? '', כתובת: s.address ?? '', הערות: s.notes ?? '' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ספקים')
    XLSX.writeFile(wb, 'ספקים.xlsx')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page heading */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>🏭 ספקים / נותני שירות</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>ניהול ספקים ונותני שירות, אנשי קשר וחובות</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => openModal()} style={btnPrim}>+ הוסף ספק</button>

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(v => !v)}
          style={{
            padding: '9px 16px',
            background: editMode ? '#fef3c7' : 'transparent',
            color: editMode ? 'var(--warning)' : 'var(--text-muted)',
            border: `1px solid ${editMode ? '#fcd34d' : 'var(--border)'}`,
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: editMode ? 700 : 400,
            cursor: 'pointer',
            transition: 'all .15s',
          }}
        >
          {editMode ? '✓ סיום עריכה' : '✏️ נהל ספקים'}
        </button>

        <input
          placeholder="חיפוש ספק / טלפון / איש קשר..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, flex: 1, minWidth: '200px', maxWidth: '340px' }}
        />
        <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
          {suppliers.length} ספקים
        </span>
        <ExcelMenu onExportExcel={exportExcel} />
      </div>

      {editMode && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
          ✏️ מצב עריכה פעיל — לחץ על הכפתורים לעריכה / מחיקה של ספקים
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* ── Suppliers list ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '52px', marginBottom: '12px' }}>🏭</div>
              <div style={{ fontSize: '14px' }}>אין ספקים. לחץ "+ הוסף ספק" כדי להתחיל.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(s => {
                const debt     = totalDebt(s.id)
                const openCnt  = openDebtsCount(s.id)
                const isActive = selected?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => !editMode && setSelected(isActive ? null : s)}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      boxShadow: isActive ? '0 0 0 2px #bbf7d0' : 'var(--shadow)',
                      padding: '14px 16px',
                      cursor: editMode ? 'default' : 'pointer',
                      transition: 'all .15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: 'var(--primary)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '17px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {s.name.charAt(0)}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {s.name}
                        {s.category && (
                          <span style={{ fontSize: '10px', background: '#ede9fe', color: '#7c3aed', padding: '1px 7px', borderRadius: '20px', fontWeight: 600, flexShrink: 0 }}>
                            {s.category}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {s.contact_name && <span>👤 {s.contact_name}</span>}
                        {s.phone && <span>📞 {s.phone}</span>}
                      </div>
                    </div>

                    {/* Debt badge */}
                    {openCnt > 0 ? (
                      <div style={{ textAlign: 'left', flexShrink: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(debt)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{openCnt} חובות</div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, flexShrink: 0 }}>✓ נקי</span>
                    )}

                    {/* Actions area */}
                    <div
                      style={{ display: 'flex', gap: '6px', flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* WhatsApp — always visible if phone exists */}
                      {s.phone && (
                        <a
                          href={waUrl(s.phone, `שלום ${s.name}, `)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="שלח הודעה בווצאפ"
                          style={{ padding: '5px 9px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                        >
                          💬
                        </a>
                      )}

                      {/* Edit / Delete — only in editMode */}
                      {editMode && (
                        <>
                          <button
                            onClick={() => openModal(s)}
                            style={{ padding: '5px 9px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}
                          >✏️</button>
                          <button
                            onClick={() => deleteSupplier(s)}
                            style={{ padding: '5px 9px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}
                          >🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected && !editMode && (
          <>
            {/* Mobile backdrop */}
            <div className="supplier-detail-backdrop" onClick={() => setSelected(null)} />
          <div className="supplier-detail-panel" style={{
            flex: 1, minWidth: 0,
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            padding: '24px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', fontWeight: 700, flexShrink: 0,
              }}>
                {selected.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>{selected.name}</h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {selected.category && (
                    <span style={{ fontSize: '11px', background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>
                      {selected.category}
                    </span>
                  )}
                  {selected.contact_name && (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>👤 {selected.contact_name}</div>
                  )}
                </div>
              </div>
              {/* WhatsApp button in panel header */}
              {selected.phone && (
                <a
                  href={waUrl(selected.phone, `שלום ${selected.name}, `)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '8px 14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  💬 ווצאפ
                </a>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}
              >✕</button>
            </div>

            {/* Contact info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'טלפון', value: selected.phone, icon: '📞' },
                { label: 'אימייל', value: selected.email, icon: '✉️' },
                { label: 'כתובת', value: selected.address, icon: '📍' },
              ].filter(f => f.value).map(f => (
                <div key={f.label} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>{f.icon} {f.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{f.value}</div>
                </div>
              ))}
              {selected.notes && (
                <div style={{ background: '#fffbeb', borderRadius: '8px', padding: '10px 14px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>📝 הערות</div>
                  <div style={{ fontSize: '13px' }}>{selected.notes}</div>
                </div>
              )}
              {(selected.bank_name || selected.bank_account) && (
                <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '10px 14px', gridColumn: '1 / -1', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>🏦 פרטי בנק לתשלום</div>
                  <div style={{ fontSize: '13px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {selected.bank_name && <span><strong>בנק:</strong> {selected.bank_name}</span>}
                    {selected.bank_branch && <span><strong>סניף:</strong> {selected.bank_branch}</span>}
                    {selected.bank_account && <span><strong>חשבון:</strong> {selected.bank_account}</span>}
                    {selected.bank_account_holder && <span><strong>שם:</strong> {selected.bank_account_holder}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Debts section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>חובות לספק</h3>
                {selectedOpenTotal > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)' }}>
                    סה"כ: {fmt(selectedOpenTotal)}
                  </span>
                )}
              </div>

              {selectedDebts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
                  ✓ אין חובות לספק זה
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedDebts
                    .sort((a, b) => a.date < b.date ? 1 : -1)
                    .map(d => {
                      const invList: InvoiceEntry[] = Array.isArray(d.invoices) && d.invoices.length > 0
                        ? d.invoices
                        : d.doc_number ? [{ type: (d.doc_type ?? 'invoice') as 'invoice' | 'karteset', number: d.doc_number, amount: Number(d.amount) }]
                        : []
                      return (
                        <div
                          key={d.id}
                          style={{
                            background: d.is_closed ? '#f9fafb' : '#fff',
                            border: `1px solid ${d.is_closed ? 'var(--border)' : '#fecaca'}`,
                            borderRadius: '8px',
                            padding: '10px 14px',
                            opacity: d.is_closed ? 0.65 : 1,
                            fontSize: '13px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              {invList.length > 0 ? (
                                invList.map((inv, i) => (
                                  <div key={i} style={{ marginBottom: '2px' }}>
                                    <span style={{ background: inv.type === 'karteset' ? '#ede9fe' : '#e0f2fe', color: inv.type === 'karteset' ? '#7c3aed' : '#0369a1', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: '6px' }}>
                                      {inv.type === 'karteset' ? 'כרטסת' : 'חשבונית'}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>#{inv.number}</span>
                                    {invList.length > 1 && (
                                      <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}> — {fmt(inv.amount)}</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div style={{ fontWeight: 600 }}>{d.description || 'ללא תיאור'}</div>
                              )}
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{d.date}</div>
                            </div>
                            <div style={{ textAlign: 'left', flexShrink: 0 }}>
                              <div style={{ fontWeight: 700, color: d.is_closed ? '#16a34a' : 'var(--danger)' }}>
                                {d.is_closed ? '✓ שולם' : `יתרה: ${fmt(bal(d))}`}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {fmt(d.paid)} / {fmt(d.amount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}

              <div style={{ marginTop: '14px', textAlign: 'center' }}>
                <a href="/debts" style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                  → מעבר לניהול חובות
                </a>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {/* ── ADD/EDIT MODAL ── */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '520px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 22px', fontSize: '17px', fontWeight: 700 }}>
              {editItem ? '✏️ עריכת ספק' : '+ ספק חדש'}
            </h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  שם ספק *
                  <input value={fName} onChange={e => setFName(e.target.value)} placeholder="שם החברה / הספק" style={inputSt} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  קטגוריה
                  <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={inputSt}>
                    <option value="">— בחר קטגוריה —</option>
                    {SUPPLIER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  איש קשר
                  <input value={fContact} onChange={e => setFContact(e.target.value)} placeholder="שם מלא" style={inputSt} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  טלפון
                  <input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="050-0000000" style={inputSt} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  אימייל
                  <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="example@mail.com" style={inputSt} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  כתובת
                  <input value={fAddress} onChange={e => setFAddress(e.target.value)} placeholder="רחוב + עיר" style={inputSt} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                הערות
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="פרטים נוספים..." rows={2} style={{ ...inputSt, resize: 'vertical' }} />
              </label>
              {/* Bank / payment details */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  פרטי חשבון לתשלום
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Bank name with auto-detect dropdown */}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    בנק
                    <div style={{ position: 'relative' }}>
                      <input
                        value={fBankName}
                        placeholder="התחל להקליד..."
                        style={{ ...inputSt, paddingLeft: '32px' }}
                        onFocus={() => setShowBankDrop(true)}
                        onBlur={() => setTimeout(() => setShowBankDrop(false), 150)}
                        onChange={e => { setFBankName(e.target.value); setShowBankDrop(true) }}
                      />
                      {/* Arrow toggle */}
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setShowBankDrop(v => !v) }}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >▼</button>
                      {/* Bank code badge */}
                      {ISRAELI_BANKS.find(b => b.name === fBankName) && (
                        <span style={{ position: 'absolute', left: '34px', top: '50%', transform: 'translateY(-50%)', background: '#e8f5ee', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', pointerEvents: 'none' }}>
                          {ISRAELI_BANKS.find(b => b.name === fBankName)!.code}
                        </span>
                      )}
                      {/* Dropdown */}
                      {showBankDrop && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: '200px', overflowY: 'auto', marginTop: '2px' }}>
                          {ISRAELI_BANKS
                            .filter(b => !fBankName || b.name.includes(fBankName) || fBankName === b.name)
                            .map(b => (
                              <div
                                key={b.code + b.name}
                                onMouseDown={e => { e.preventDefault(); setFBankName(b.name); setShowBankDrop(false) }}
                                style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: fBankName === b.name ? '#f0fdf4' : undefined }}
                              >
                                <span>{b.name}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{b.code}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    סניף
                    <input value={fBankBranch} onChange={e => setFBankBranch(e.target.value)} placeholder="מספר סניף" style={inputSt} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    מספר חשבון
                    <input value={fBankAccount} onChange={e => setFBankAccount(e.target.value)} placeholder="12345678" style={inputSt} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    שם בעל החשבון
                    <input value={fBankHolder} onChange={e => setFBankHolder(e.target.value)} placeholder="שם מלא" style={inputSt} />
                  </label>
                </div>
              </div>
            </div>
            <div className="sticky-actions">
              <button onClick={() => setShowModal(false)} style={btnSec}>ביטול</button>
              <button onClick={saveSupplier} disabled={saving} style={btnPrim}>
                {saving ? 'שומר...' : '💾 שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
