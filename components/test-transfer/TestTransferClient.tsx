'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'

// ── Types ───────────────────────────────────────────────────────────────────────

type TransferStatus = 'ממתין' | 'בדרך' | 'בטסט' | 'עבר' | 'נכשל' | 'הושלם'

interface ExtraCharge {
  description: string
  amount: string
  paid: boolean
}

interface TestTransfer {
  id: string
  tenant_id: string
  plate: string
  make: string | null
  model: string | null
  year: number | null
  customer_name: string
  customer_phone: string
  transfer_date: string | null
  notes: string | null
  status: TransferStatus
  extra_charges: ExtraCharge[]
  track_token: string | null
  created_at: string
}

// ── Consts ───────────────────────────────────────────────────────────────────────

const ALL_STATUSES: TransferStatus[] = ['ממתין', 'בדרך', 'בטסט', 'עבר', 'נכשל', 'הושלם']

const STATUS_COLOR: Record<TransferStatus, { bg: string; text: string }> = {
  'ממתין':  { bg: '#f1f5f9', text: '#475569' },
  'בדרך':   { bg: '#eff6ff', text: '#2563eb' },
  'בטסט':   { bg: '#fefce8', text: '#b45309' },
  'עבר':    { bg: '#f0fdf4', text: '#15803d' },
  'נכשל':   { bg: '#fef2f2', text: '#dc2626' },
  'הושלם':  { bg: '#f0fdf4', text: '#059669' },
}

const emptyForm = {
  plate: '',
  make: '',
  model: '',
  year: '',
  customer_name: '',
  customer_phone: '',
  transfer_date: '',
  notes: '',
  status: 'ממתין' as TransferStatus,
}

const emptyCharge = (): ExtraCharge => ({ description: '', amount: '', paid: false })

// ── Helpers ──────────────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 700,
      color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.4px', marginBottom: 4,
    }}>
      {children}
    </label>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: TransferStatus }) {
  const c = STATUS_COLOR[status] ?? { bg: '#f1f5f9', text: '#475569' }
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontWeight: 700, fontSize: 12, padding: '3px 10px',
      borderRadius: 20, display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function CopyCell({ value }: { value: string | number | null | undefined }) {
  const [copied, setCopied] = useState(false)
  const text = value != null ? String(value) : ''
  const copy = () => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{text || '—'}</span>
      {text && (
        <button onClick={copy} title="העתק" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '1px 3px', borderRadius: 4, fontSize: 11,
          color: copied ? 'var(--primary)' : 'var(--text-muted)',
          opacity: 0.6, flexShrink: 0, lineHeight: 1,
        }}>
          {copied ? '✓' : '⧉'}
        </button>
      )}
    </span>
  )
}

function ActionBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: 14, padding: '4px 5px', borderRadius: 6, color: 'var(--text-muted)',
    }}>
      {children}
    </button>
  )
}

// ── ExtraChargesSection – defined OUTSIDE main component to prevent remount ─────

interface ExtraChargesSectionProps {
  charges: ExtraCharge[]
  onChange: (charges: ExtraCharge[]) => void
}

function ExtraChargesSection({ charges, onChange }: ExtraChargesSectionProps) {
  const addRow = () => onChange([...charges, emptyCharge()])
  const removeRow = (i: number) => onChange(charges.filter((_, idx) => idx !== i))
  const updateRow = (i: number, field: keyof ExtraCharge, value: string | boolean) => {
    const next = charges.map((c, idx) => idx === i ? { ...c, [field]: value } : c)
    onChange(next)
  }

  const total = charges.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
  const totalPaid = charges.reduce((sum, c) => c.paid ? sum + (parseFloat(c.amount) || 0) : sum, 0)

  return (
    <Section icon="💰" title="חיובים נוספים / תיקונים">
      {charges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          אין חיובים נוספים
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 80px 32px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>תיאור</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>סכום (₪)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>שולם?</span>
            <span />
          </div>
          {charges.map((charge, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 80px 32px', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input"
                value={charge.description}
                onChange={e => updateRow(i, 'description', e.target.value)}
                placeholder="תיאור התיקון / החיוב"
                style={{ fontSize: 13 }}
              />
              <input
                className="form-input"
                type="number"
                min="0"
                value={charge.amount}
                onChange={e => updateRow(i, 'amount', e.target.value)}
                placeholder="0"
                style={{ fontSize: 13, textAlign: 'left', direction: 'ltr' }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={charge.paid}
                  onChange={e => updateRow(i, 'paid', e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              </div>
              <button
                onClick={() => removeRow(i)}
                title="הסר שורה"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 16, color: 'var(--danger)', padding: '2px 4px', borderRadius: 6,
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={addRow}
          style={{
            padding: '7px 16px', border: '1.5px dashed var(--border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: 'var(--primary)',
            background: 'transparent', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          + הוסף שורה
        </button>
        {charges.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
            <span>סה&quot;כ: <strong style={{ color: 'var(--text)' }}>₪{total.toLocaleString()}</strong></span>
            <span>שולם: <strong style={{ color: 'var(--primary)' }}>₪{totalPaid.toLocaleString()}</strong></span>
            {total - totalPaid > 0 && (
              <span>יתרה: <strong style={{ color: 'var(--danger)' }}>₪{(total - totalPaid).toLocaleString()}</strong></span>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────────

export default function TestTransferClient() {
  const supabase   = useRef(createClient()).current
  const tenantId   = useRef<string | null>(null)
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [transfers, setTransfers]       = useState<TestTransfer[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<'entry' | 'history'>('entry')
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState({ ...emptyForm })
  const [charges, setCharges]           = useState<ExtraCharge[]>([])
  const [saving, setSaving]             = useState(false)
  const [plateLoading, setPlateLoading] = useState(false)
  const [search, setSearch]             = useState('')
  const [showActions, setShowActions]   = useState(false)
  const [fieldErrors, setFieldErrors]   = useState<Set<string>>(new Set())
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'הכל'>('הכל')

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadTransfers = useCallback(async () => {
    if (!tenantId.current) return
    const { data } = await supabase
      .from('test_transfers')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .order('created_at', { ascending: false })
    setTransfers((data ?? []).map(r => ({
      ...r,
      extra_charges: Array.isArray(r.extra_charges) ? r.extra_charges : [],
    })))
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      tenantId.current = profile.tenant_id
      await loadTransfers()
      setLoading(false)
    }
    init()
  }, [supabase, loadTransfers])

  // ── Plate search ─────────────────────────────────────────────────────────────

  const handlePlateSearch = async () => {
    if (!form.plate) return
    setPlateLoading(true)
    const data = await fetchVehicleByPlate(form.plate)
    if (data) {
      setForm(f => ({
        ...f,
        make:  data.make  ?? f.make,
        model: data.model ?? f.model,
        year:  data.year  ? String(data.year) : f.year,
      }))
      showToast('פרטי רכב נטענו מהמאגר הממשלתי', 'success')
    } else {
      showToast('לא נמצאו פרטים ללוחית זו', 'error')
    }
    setPlateLoading(false)
  }

  // ── Clear / Open edit ────────────────────────────────────────────────────────

  const clearForm = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setCharges([])
    setFieldErrors(new Set())
    setEditModalOpen(false)
  }

  const openEdit = (t: TestTransfer) => {
    setEditingId(t.id)
    setForm({
      plate:          t.plate,
      make:           t.make          ?? '',
      model:          t.model         ?? '',
      year:           t.year          ? String(t.year) : '',
      customer_name:  t.customer_name,
      customer_phone: t.customer_phone,
      transfer_date:  t.transfer_date ?? '',
      notes:          t.notes         ?? '',
      status:         t.status,
    })
    setCharges(t.extra_charges ?? [])
    setEditModalOpen(true)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const errors = new Set<string>()
    if (!form.plate.trim())          errors.add('plate')
    if (!form.customer_name.trim())  errors.add('customer_name')
    if (!form.customer_phone.trim()) errors.add('customer_phone')
    if (errors.size > 0) {
      setFieldErrors(errors)
      const labels = [...errors].map(f =>
        f === 'plate' ? 'מספר רכב' : f === 'customer_name' ? 'שם לקוח' : 'טלפון'
      ).join(', ')
      showToast(`שדות חובה חסרים: ${labels}`, 'error')
      return
    }
    setFieldErrors(new Set())
    setSaving(true)

    const payload = {
      tenant_id:      tenantId.current,
      plate:          form.plate.trim(),
      make:           form.make.trim()           || null,
      model:          form.model.trim()          || null,
      year:           form.year                  ? Number(form.year) : null,
      customer_name:  form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      transfer_date:  form.transfer_date         || null,
      notes:          form.notes.trim()          || null,
      status:         form.status,
      extra_charges:  charges.filter(c => c.description.trim() || c.amount),
    }

    if (editingId) {
      const { error } = await supabase.from('test_transfers').update(payload).eq('id', editingId)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('test_transfers').insert(payload)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
    }

    setSaving(false)
    showToast('נשמר בהצלחה', 'success')
    loadTransfers()
    clearForm()
  }

  // ── Quick status update ───────────────────────────────────────────────────────

  const updateStatus = async (id: string, status: TransferStatus) => {
    await supabase.from('test_transfers').update({ status }).eq('id', id)
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  // ── WhatsApp / copy link ─────────────────────────────────────────────────────

  const handleCopyLink = (t: TestTransfer) => {
    if (!t.track_token) { showToast('אין לינק מעקב', 'error'); return }
    const url = `${window.location.origin}/track/${t.track_token}`
    navigator.clipboard.writeText(url)
      .then(() => showToast('לינק הועתק ללוח', 'success'))
      .catch(() => showToast('שגיאה בהעתקה', 'error'))
  }

  const handleWhatsApp = (t: TestTransfer) => {
    if (!t.track_token || !t.customer_phone) {
      showToast('אין טלפון ללקוח', 'error')
      return
    }
    const url     = `${window.location.origin}/track/${t.track_token}`
    const carInfo = [t.make, t.model].filter(Boolean).join(' ')
    const dateStr = t.transfer_date
      ? `\nתאריך טסט: ${new Date(t.transfer_date).toLocaleDateString('he-IL')}`
      : ''
    const msg = `שלום ${t.customer_name},\nרכבך ${carInfo ? `(${carInfo}) ` : ''}לוחית ${t.plate} בתהליך שינוע לטסט.${dateStr}\nלמעקב סטטוס בזמן אמת: ${url}`
    const phone = t.customer_phone.replace(/\D/g, '')
    window.open(`https://wa.me/972${phone.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק את השינוע?', variant: 'danger' })
    if (!ok) return
    await supabase.from('test_transfers').delete().eq('id', id)
    showToast('נמחק', 'success')
    loadTransfers()
  }

  // ── Filter ────────────────────────────────────────────────────────────────────

  const filtered = transfers.filter(t => {
    if (statusFilter !== 'הכל' && t.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.plate.toLowerCase().includes(q)          ||
      t.customer_name.toLowerCase().includes(q)  ||
      t.customer_phone.includes(q)               ||
      (t.make  ?? '').toLowerCase().includes(q)  ||
      (t.model ?? '').toLowerCase().includes(q)
    )
  })

  const onChange = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (fieldErrors.has(k)) setFieldErrors(s => { const n = new Set(s); n.delete(k); return n })
  }

  // ── Form sections (reused in entry tab + edit modal) ─────────────────────────

  const renderFormFields = () => (
    <>
      <div className="inspections-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

        {/* Customer */}
        <Section icon="👤" title="פרטי לקוח">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { key: 'customer_name',  label: 'שם לקוח *',  placeholder: 'ישראל ישראלי' },
              { key: 'customer_phone', label: 'טלפון *',     placeholder: '050-0000000' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <FL>{label}</FL>
                <input
                  value={form[key as keyof typeof emptyForm] as string}
                  onChange={e => onChange(key, e.target.value)}
                  className="form-input"
                  placeholder={placeholder}
                  style={fieldErrors.has(key) ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(220,38,38,.15)' } : undefined}
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Vehicle */}
        <Section icon="🚗" title="פרטי רכב">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: '0 0 160px' }}>
              <FL>מספר רכב *</FL>
              <input
                value={form.plate}
                onChange={e => onChange('plate', e.target.value)}
                className="form-input font-mono font-bold"
                style={{ fontSize: 15, letterSpacing: 1, ...(fieldErrors.has('plate') ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(220,38,38,.15)' } : {}) }}
                placeholder="12-345-67"
                dir="ltr"
              />
            </div>
            <div style={{ paddingTop: 20 }}>
              <Button size="sm" onClick={handlePlateSearch} disabled={plateLoading}>
                {plateLoading ? '...' : '🔍 מלא אוטומטית'}
              </Button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { key: 'make',  label: 'יצרן',       placeholder: 'טויוטה' },
              { key: 'model', label: 'דגם',         placeholder: 'קורולה' },
              { key: 'year',  label: 'שנת ייצור',   placeholder: '2020' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <FL>{label}</FL>
                <input
                  value={form[key as keyof typeof emptyForm] as string}
                  onChange={e => onChange(key, e.target.value)}
                  className="form-input"
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Details */}
      <Section icon="📋" title="פרטים נוספים">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div>
            <FL>תאריך טסט</FL>
            <input
              type="date"
              value={form.transfer_date}
              onChange={e => onChange('transfer_date', e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <FL>סטטוס</FL>
            <select
              value={form.status}
              onChange={e => onChange('status', e.target.value)}
              className="form-input"
              style={{ cursor: 'pointer' }}
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FL>הערות</FL>
            <textarea
              value={form.notes}
              onChange={e => onChange('notes', e.target.value)}
              className="form-input"
              rows={3}
              placeholder="הערות נוספות..."
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>
        </div>
      </Section>

      {/* Extra charges */}
      <ExtraChargesSection charges={charges} onChange={setCharges} />
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>טוען...</div>
  }

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Page title */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px #f59e0b44' }}>
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="1"/>
            <path d="M16 8h4l3 3v4h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>שינוע לטסטים</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{transfers.length} שינועים שמורים</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="scroll-x" style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          {([
            { key: 'entry',   label: 'הזנת נתונים', icon: '📝' },
            { key: 'history', label: 'היסטוריה',    icon: '📋' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '7px 18px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
                background: tab === t.key ? '#fff' : 'transparent',
                borderRadius: '8px', whiteSpace: 'nowrap',
                boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                transition: 'all .15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: הזנת נתונים ── */}
      {tab === 'entry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {renderFormFields()}

          {/* Action bar */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 18px',
          }}>
            <Button
              fullWidth
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 15, fontWeight: 800, padding: '10px 0' }}
            >
              {saving ? 'שומר...' : '💾 שמור שינוע'}
            </Button>
            <button
              onClick={clearForm}
              style={{
                flexShrink: 0, padding: '10px 20px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'white', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                color: 'var(--text-muted)', whiteSpace: 'nowrap',
              }}
            >
              🗑️ נקה
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: היסטוריה ── */}
      {tab === 'history' && (
        <div>
          {/* History header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>מאגר שינועים</span>
              <span style={{ fontSize: 18 }}>📋</span>
            </div>
            <button
              onClick={() => setShowActions(v => !v)}
              style={{
                padding: '6px 14px', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                background: showActions ? 'var(--primary)' : 'var(--bg-card)',
                color: showActions ? '#fff' : 'var(--text-muted)',
                transition: 'all .15s',
              }}
            >
              ✏️ {showActions ? 'סיום עריכה' : 'עריכה'}
            </button>
          </div>

          {/* Status filter chips */}
          <div className="scroll-x" style={{ marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {(['הכל', ...ALL_STATUSES] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s as TransferStatus | 'הכל')}
                  style={{
                    padding: '5px 14px', borderRadius: 20, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                    whiteSpace: 'nowrap', transition: 'all .15s',
                    background: statusFilter === s
                      ? (s === 'הכל' ? 'var(--primary)' : STATUS_COLOR[s as TransferStatus]?.bg ?? '#f1f5f9')
                      : '#f1f5f9',
                    color: statusFilter === s
                      ? (s === 'הכל' ? '#fff' : STATUS_COLOR[s as TransferStatus]?.text ?? '#475569')
                      : 'var(--text-muted)',
                    boxShadow: statusFilter === s ? '0 1px 4px rgba(0,0,0,.12)' : 'none',
                  }}
                >
                  {s}
                  {s !== 'הכל' && (
                    <span style={{ marginRight: 5, opacity: 0.7 }}>
                      ({transfers.filter(t => t.status === s).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 12, pointerEvents: 'none', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input-global"
              placeholder="חיפוש לפי שם, מספר רכב, טלפון, דגם..."
              style={{ paddingRight: 34 }}
            />
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🚐</div>
              <div style={{ fontWeight: 700 }}>אין שינועים</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>עבור לטאב &quot;הזנת נתונים&quot; להוספה</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(t => {
                const makeModel = [t.make, t.model].filter(Boolean).join(' ')
                const totalCharges = t.extra_charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
                const unpaidCharges = t.extra_charges.reduce((s, c) => !c.paid ? s + (parseFloat(c.amount) || 0) : s, 0)
                return (
                  <div key={t.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '12px 16px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Header: plate + status + date */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        background: 'var(--primary-light,#e8f7f0)', color: 'var(--primary)',
                        fontWeight: 800, fontFamily: 'monospace', padding: '3px 10px',
                        borderRadius: 6, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        🚗 <CopyCell value={t.plate} />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Quick status dropdown */}
                        {showActions ? (
                          <select
                            value={t.status}
                            onChange={e => updateStatus(t.id, e.target.value as TransferStatus)}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '3px 8px',
                              border: '1px solid var(--border)', borderRadius: 20,
                              cursor: 'pointer', fontFamily: 'inherit',
                              background: STATUS_COLOR[t.status]?.bg ?? '#f1f5f9',
                              color: STATUS_COLOR[t.status]?.text ?? '#475569',
                            }}
                          >
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                        {t.transfer_date && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {t.transfer_date}</span>
                        )}
                      </div>
                    </div>

                    {/* Customer name + phone */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                        <CopyCell value={t.customer_name} />
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', direction: 'ltr', flexShrink: 0 }}>
                        <CopyCell value={t.customer_phone} />
                      </span>
                    </div>

                    {/* Vehicle info */}
                    {(makeModel || t.year) && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {makeModel && <span>{makeModel}</span>}
                        {t.year && <span>{t.year}</span>}
                      </div>
                    )}

                    {/* Notes */}
                    {t.notes && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        📝 {t.notes}
                      </div>
                    )}

                    {/* Extra charges summary */}
                    {t.extra_charges.length > 0 && (
                      <div style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          💰 {t.extra_charges.length} חיובים · סה&quot;כ{' '}
                          <strong style={{ color: 'var(--text)' }}>₪{totalCharges.toLocaleString()}</strong>
                        </span>
                        {unpaidCharges > 0 && (
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                            יתרה לתשלום: ₪{unpaidCharges.toLocaleString()}
                          </span>
                        )}
                        {unpaidCharges === 0 && totalCharges > 0 && (
                          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓ שולם במלואו</span>
                        )}
                      </div>
                    )}

                    {/* Footer: track link + actions */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      {/* WhatsApp + copy link – always visible */}
                      {t.track_token && (
                        <>
                          <ActionBtn onClick={() => handleWhatsApp(t)} title="שלח לינק מעקב בוואטסאפ">📲</ActionBtn>
                          <ActionBtn onClick={() => handleCopyLink(t)} title="העתק לינק מעקב">🔗</ActionBtn>
                        </>
                      )}
                      <div style={{ flex: 1 }} />
                      {showActions && (
                        <>
                          <ActionBtn onClick={() => openEdit(t)} title="עריכה">✏️</ActionBtn>
                          <ActionBtn onClick={() => handleDelete(t.id)} title="מחיקה">🗑️</ActionBtn>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModalOpen && (
        <>
          <div onClick={clearForm} style={{
            position: 'fixed', inset: 0, zIndex: 499,
            background: 'rgba(0,0,0,0.45)',
          }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: '100%', maxWidth: 760,
            zIndex: 500, background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 20px',
              background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, zIndex: 1, flexShrink: 0,
            }}>
              <button onClick={clearForm} style={{
                background: 'none', border: 'none', fontSize: 20, lineHeight: 1,
                cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
              }}>✕</button>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>עריכת שינוע</span>
            </div>

            {/* Form */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {renderFormFields()}

              {/* Action bar */}
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '12px 18px',
                position: 'sticky', bottom: 0,
              }}>
                <Button fullWidth onClick={handleSave} disabled={saving}
                  style={{ fontSize: 15, fontWeight: 800, padding: '10px 0' }}>
                  {saving ? 'שומר...' : '💾 שמור'}
                </Button>
                <button onClick={clearForm} style={{
                  flexShrink: 0, padding: '10px 16px',
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'white', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                  color: 'var(--text-muted)',
                }}>✕</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
