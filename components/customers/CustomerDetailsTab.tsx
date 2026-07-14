'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import Button from '@/components/ui/Button'
import { Customer, CustomerLedgerDebt, fmt, bal, waUrl } from './shared'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceEntry {
  type: string
  number: string
  amount: number
  description?: string
}

interface CustomerDetailsTabProps {
  tenantId: string
  customers: Customer[]
  debts: CustomerLedgerDebt[]
  categories: string[]
  openId: string | null
  onOpenTracking: (customerId: string) => void
  reload: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomerDetailsTab({
  tenantId, customers, debts, categories, openId, onOpenTracking, reload,
}: CustomerDetailsTabProps) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()

  const [search, setSearch] = useState('')

  // Detail panel
  const [selected, setSelected] = useState<Customer | null>(null)

  // Customer form
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem]   = useState<Customer | null>(null)
  const [fName, setFName]         = useState('')
  const [fPhone, setFPhone]       = useState('')
  const [fEmail, setFEmail]       = useState('')
  const [fAddress, setFAddress]   = useState('')
  const [fNotes, setFNotes]       = useState('')
  const [fCategory, setFCategory]             = useState('')
  const [fOpeningBalance, setFOpeningBalance] = useState('')
  const [saving, setSaving]       = useState(false)

  // Deep-link: ?open=<customerId> (parsed once by the shell, passed down as `openId`)
  useEffect(() => {
    if (!openId) return
    const target = customers.find(c => c.id === openId)
    if (target) setSelected(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, customers.length])

  // ── Customer CRUD ─────────────────────────────────────────────────────────

  const openModal = (c?: Customer) => {
    if (c) {
      setEditItem(c)
      setFName(c.name); setFCategory(c.category ?? ''); setFPhone(c.phone ?? '')
      setFEmail(c.email ?? ''); setFAddress(c.address ?? ''); setFNotes(c.notes ?? '')
      setFOpeningBalance(c.opening_balance ? String(c.opening_balance) : '')
    } else {
      setEditItem(null)
      setFName(''); setFCategory(''); setFPhone('')
      setFEmail(''); setFAddress(''); setFNotes('')
      setFOpeningBalance('')
    }
    setShowModal(true)
  }

  const saveCustomer = async () => {
    if (!fName.trim()) { showToast('נא להזין שם לקוח', 'error'); return }
    const tid = tenantId!
    setSaving(true)
    const row = {
      tenant_id: tid,
      name: fName.trim(),
      category: fCategory.trim() || null,
      phone: fPhone.trim() || null,
      email: fEmail.trim() || null,
      address: fAddress.trim() || null,
      notes: fNotes.trim() || null,
      opening_balance: parseFloat(fOpeningBalance) || 0,
    }
    if (editItem) {
      const { error } = await supabase.from('customers').update(row).eq('id', editItem.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setSaving(false); return }
      showToast('עודכן ✓', 'success')
      if (selected?.id === editItem.id) setSelected({ ...editItem, ...row })
    } else {
      const { error } = await supabase.from('customers').insert({ ...row, id: crypto.randomUUID() })
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      showToast('לקוח נוסף ✓', 'success')
    }
    // Auto-save new category to DB
    const cat = fCategory.trim()
    if (cat && !categories.includes(cat)) {
      await supabase.from('customer_categories').insert({ tenant_id: tid, name: cat })
    }
    setSaving(false); setShowModal(false); reload()
  }

  const deleteCustomer = async (c: Customer) => {
    if (!confirm(`למחוק את הלקוח "${c.name}"?\nחובות המקושרים ללקוח זה לא יימחקו.`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) { showToast('שגיאה במחיקה', 'error'); return }
    showToast('נמחק', 'success')
    if (selected?.id === c.id) setSelected(null)
    reload()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = customers.filter(c =>
    !search.trim() ||
    c.name.includes(search) ||
    (c.phone?.includes(search) ?? false)
  )

  const custDebts      = (custId: string) => debts.filter(d => d.customer_id === custId)
  const totalDebt      = (custId: string) => custDebts(custId).filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)
  const openDebtsCount = (custId: string) => custDebts(custId).filter(d => !d.is_closed).length

  const selectedDebts     = selected ? custDebts(selected.id) : []
  const selectedOpenTotal = selected ? totalDebt(selected.id) : 0

  // ── Excel / JSON ───────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = customers.map(c => ({ שם: c.name, קטגוריה: c.category ?? '', טלפון: c.phone ?? '', מייל: c.email ?? '', כתובת: c.address ?? '', הערות: c.notes ?? '' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'לקוחות')
    XLSX.writeFile(wb, 'לקוחות.xlsx')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => openModal()}>+ הוסף לקוח</Button>

        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '340px', display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 10, pointerEvents: 'none', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            placeholder="חיפוש לקוח / טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingRight: 30 }}
          />
        </div>
        <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
          {customers.length} לקוחות
        </span>
        <ExcelMenu onExportExcel={exportExcel} />
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* ── Customers list ── */}
        <div style={{ flex: 1, minWidth: 0, maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto', paddingLeft: '4px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '52px', marginBottom: '12px' }}>💳</div>
              <div style={{ fontSize: '14px' }}>אין לקוחות. לחץ &quot;+ הוסף לקוח&quot; כדי להתחיל.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {filtered.map(c => {
                const debt     = totalDebt(c.id)
                const openCnt  = openDebtsCount(c.id)
                const isActive = selected?.id === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelected(isActive ? null : c)}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      boxShadow: isActive ? '0 0 0 2px #bbf7d0' : 'var(--shadow)',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all .15s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Avatar */}
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '17px', fontWeight: 700, flexShrink: 0,
                      }}>
                        {c.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {c.name}
                          {c.category && (
                            <span style={{ fontSize: '10px', background: '#ede9fe', color: '#7c3aed', padding: '1px 7px', borderRadius: '20px', fontWeight: 600, flexShrink: 0 }}>
                              {c.category}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {c.phone && <span>📞 {c.phone}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
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
                        {c.phone && (
                          <a
                            href={waUrl(c.phone, `שלום ${c.name}, `)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="שלח הודעה בווצאפ"
                            style={{ padding: '5px 9px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                          >
                            💬
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected && (
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
              <Button variant="outline" size="sm" onClick={() => openModal(selected)}>✏️ ערוך</Button>
              <Button variant="danger" size="sm" onClick={() => deleteCustomer(selected)}>🗑 מחק</Button>
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
              {!!selected.opening_balance && (
                <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>📒 יתרת פתיחה</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{selected.opening_balance.toLocaleString('he-IL')} ₪</div>
                </div>
              )}
            </div>

            {/* Balance summary */}
            {selectedOpenTotal > 0 && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: '140px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>יתרת חוב פתוחה</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(selectedOpenTotal)}</div>
                </div>
              </div>
            )}

            {/* Debts section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>חובות הלקוח</h3>
                {selectedOpenTotal > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)' }}>
                    סה&quot;כ: {fmt(selectedOpenTotal)}
                  </span>
                )}
              </div>

              {selectedDebts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
                  ✓ אין חובות ללקוח זה
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
                <button
                  onClick={() => selected && onOpenTracking(selected.id)}
                  style={{ fontSize: '12px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  → מעקב לקוחות מפורט
                </button>
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
              {editItem ? '✏️ עריכת לקוח' : '+ לקוח חדש'}
            </h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  שם לקוח *
                  <input value={fName} onChange={e => setFName(e.target.value)} placeholder="שם הלקוח" className="form-input" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  קטגוריה
                  <input
                    value={fCategory}
                    onChange={e => setFCategory(e.target.value)}
                    list="customer-categories-list"
                    placeholder="בחר או הקלד קטגוריה"
                    className="form-input"
                  />
                  <datalist id="customer-categories-list">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  טלפון
                  <input type="tel" value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="050-0000000" className="form-input" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  אימייל
                  <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="example@mail.com" className="form-input" />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                כתובת
                <input value={fAddress} onChange={e => setFAddress(e.target.value)} placeholder="רחוב + עיר" className="form-input" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                הערות
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="פרטים נוספים..." rows={2} className="form-input" style={{ resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                יתרת פתיחה
                <input type="number" step="0.01" value={fOpeningBalance} onChange={e => setFOpeningBalance(e.target.value)} placeholder="0" className="form-input" />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>חוב שהיה קיים לפני תחילת המעקב במערכת — משמש כנקודת פתיחה בכרטסת המודפסת</span>
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowModal(false)}>ביטול</Button>
              <Button loading={saving} onClick={saveCustomer}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
