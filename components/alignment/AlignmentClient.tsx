'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ExcelMenu from '@/components/ui/ExcelMenu'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'

// ── Types ──────────────────────────────────────────────────────────────────────

type JobStatus = 'waiting' | 'in_progress' | 'done' | 'delivered'

interface AlignmentJob {
  id: string
  tenant_id: string
  plate: string
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  customer_name: string
  customer_phone: string | null
  job_type: string
  notes: string | null
  technician: string | null
  price: number | null
  status: JobStatus
  track_token: string | null
  created_at: string
  updated_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES: { key: JobStatus; label: string; color: string; bg: string }[] = [
  { key: 'waiting',     label: '⏳ ממתין',  color: '#92400e', bg: '#fef3c7' },
  { key: 'in_progress', label: '🔧 בטיפול', color: '#1e40af', bg: '#dbeafe' },
  { key: 'done',        label: '✅ הושלם',  color: '#065f46', bg: '#d1fae5' },
  { key: 'delivered',   label: '🚗 נמסר',   color: '#6b7280', bg: '#f3f4f6' },
]

const JOB_TYPES = ['כיוון צירים', 'איזון גלגלים', 'כיוון + איזון', 'אחר']

const emptyForm = {
  plate: '', customer_name: '', customer_phone: '',
  make: '', model: '', year: '', color: '',
  job_type: 'כיוון צירים', notes: '', technician: '', price: '',
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const selSt: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '14px', background: '#fff', color: 'var(--text)', fontFamily: 'inherit', width: '100%',
}
const labelSt: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px',
}
const areaSt: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
}

// ── Job Card ───────────────────────────────────────────────────────────────────

function JobCard({
  job, onEdit, onDelete, onWhatsApp, onStatusChange, onCopyLink,
}: {
  job: AlignmentJob
  onEdit: (job: AlignmentJob) => void
  onDelete: (id: string) => void
  onWhatsApp: (job: AlignmentJob) => void
  onStatusChange: (id: string, status: JobStatus) => void
  onCopyLink: (job: AlignmentJob) => void
}) {
  const carInfo   = [job.make, job.model, job.year].filter(Boolean).join(' ')
  const curStatus = STATUSES.find(s => s.key === job.status)!

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Color strip */}
      <div style={{ height: '4px', background: curStatus.color }} />

      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>

        {/* Plate + job type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontWeight: 700, fontSize: '15px', fontFamily: 'monospace',
            background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '6px',
          }}>
            {job.plate}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{job.job_type}</span>
        </div>

        {/* Car info */}
        {carInfo && (
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{carInfo}</div>
        )}

        {/* Customer */}
        <div style={{ fontSize: '13px', color: 'var(--text)' }}>{job.customer_name}</div>
        {job.customer_phone && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{job.customer_phone}</div>
        )}

        {/* Details */}
        {(job.technician || job.price != null) && (
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {job.technician && <span>👷 {job.technician}</span>}
            {job.price != null && (
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>₪{job.price.toLocaleString()}</span>
            )}
          </div>
        )}

        {/* Notes */}
        {job.notes && (
          <div style={{
            fontSize: '12px', color: 'var(--text-muted)',
            paddingTop: '6px', borderTop: '1px solid var(--border)',
          }}>
            {job.notes}
          </div>
        )}

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
          {STATUSES.map(s => (
            <button key={s.key} onClick={() => onStatusChange(job.id, s.key)} style={{
              padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
              border: 'none', cursor: s.key === job.status ? 'default' : 'pointer',
              background: s.key === job.status ? s.color : 'var(--bg)',
              color: s.key === job.status ? '#fff' : 'var(--text-muted)',
              transition: 'all .15s',
            }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          {job.customer_phone
            ? <Button size="sm" variant="secondary" style={{ flex: 1 }} onClick={() => onWhatsApp(job)}>📲 וואטסאפ</Button>
            : <Button size="sm" variant="secondary" style={{ flex: 1 }} onClick={() => onCopyLink(job)}>📋 העתק לינק</Button>
          }
          <Button size="sm" variant="secondary" onClick={() => onEdit(job)}>✏️</Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(job.id)}>🗑️</Button>
        </div>
      </div>
    </div>
  )
}

// ── Job Form ───────────────────────────────────────────────────────────────────

function JobForm({
  form, onChange, plateLoading, onPlateSearch,
}: {
  form: typeof emptyForm
  onChange: (k: string, v: string) => void
  plateLoading: boolean
  onPlateSearch: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Plate */}
      <div>
        <label style={labelSt}>לוחית רישוי *</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={form.plate}
            onChange={e => onChange('plate', e.target.value)}
            dir="ltr"
            placeholder="12-345-67"
            style={{ ...areaSt, fontFamily: 'monospace', resize: 'none', flex: 1, padding: '8px 12px' }}
          />
          <Button size="sm" onClick={onPlateSearch} loading={plateLoading}>🔍 מלא</Button>
        </div>
      </div>

      {/* Car details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Input label="יצרן"  value={form.make}  onChange={e => onChange('make',  e.target.value)} />
        <Input label="דגם"   value={form.model} onChange={e => onChange('model', e.target.value)} />
        <Input label="שנה"   value={form.year}  onChange={e => onChange('year',  e.target.value)} type="number" />
        <Input label="צבע"   value={form.color} onChange={e => onChange('color', e.target.value)} />
      </div>

      {/* Customer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Input label="שם לקוח *"  value={form.customer_name}  onChange={e => onChange('customer_name',  e.target.value)} />
        <Input label="טלפון"       value={form.customer_phone} onChange={e => onChange('customer_phone', e.target.value)} />
      </div>

      {/* Job */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={labelSt}>סוג עבודה *</label>
          <select style={selSt} value={form.job_type} onChange={e => onChange('job_type', e.target.value)}>
            {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <Input label="מחיר (₪)" value={form.price} onChange={e => onChange('price', e.target.value)} type="number" />
      </div>

      <Input label="טכנאי" value={form.technician} onChange={e => onChange('technician', e.target.value)} />

      <div>
        <label style={labelSt}>הערות</label>
        <textarea
          value={form.notes}
          onChange={e => onChange('notes', e.target.value)}
          rows={2}
          style={areaSt}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AlignmentClient() {
  const supabase      = useRef(createClient()).current
  const tenantId      = useRef<string | null>(null)
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [jobs,         setJobs]         = useState<AlignmentJob[]>([])
  const [loading,      setLoading]      = useState(true)
  const [editingJob,   setEditingJob]   = useState<AlignmentJob | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [form,         setForm]         = useState({ ...emptyForm })
  const [saving,       setSaving]       = useState(false)
  const [plateLoading, setPlateLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    if (!tenantId.current) return
    const { data } = await supabase
      .from('alignment_jobs')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .order('created_at', { ascending: false })
    setJobs(data ?? [])
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (profile) {
        tenantId.current = profile.tenant_id
        await loadJobs()
      }
      setLoading(false)
    }
    init()
  }, [supabase, loadJobs])

  // ── Status change ─────────────────────────────────────────────────────────────

  const updateStatus = async (id: string, status: JobStatus) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j))
    await supabase
      .from('alignment_jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  // ── Plate search ──────────────────────────────────────────────────────────────

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
        color: data.color ?? f.color,
      }))
      showToast('פרטי רכב נטענו', 'success')
    } else {
      showToast('לא נמצאו פרטים ללוחית זו', 'error')
    }
    setPlateLoading(false)
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingJob(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  const openEdit = (job: AlignmentJob) => {
    setEditingJob(job)
    setForm({
      plate:          job.plate,
      customer_name:  job.customer_name,
      customer_phone: job.customer_phone ?? '',
      make:           job.make   ?? '',
      model:          job.model  ?? '',
      year:           job.year   ? String(job.year) : '',
      color:          job.color  ?? '',
      job_type:       job.job_type,
      notes:          job.notes  ?? '',
      technician:     job.technician ?? '',
      price:          job.price != null ? String(job.price) : '',
    })
    setShowModal(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.plate.trim() || !form.customer_name.trim()) {
      showToast('נדרשים לוחית ושם לקוח', 'error')
      return
    }
    setSaving(true)
    const payload = {
      tenant_id:      tenantId.current,
      plate:          form.plate.trim(),
      customer_name:  form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      make:           form.make.trim()  || null,
      model:          form.model.trim() || null,
      year:           form.year  ? Number(form.year)  : null,
      color:          form.color.trim() || null,
      job_type:       form.job_type,
      notes:          form.notes.trim() || null,
      technician:     form.technician.trim() || null,
      price:          form.price ? Number(form.price) : null,
      updated_at:     new Date().toISOString(),
    }
    if (editingJob) {
      const { error } = await supabase.from('alignment_jobs').update(payload).eq('id', editingJob.id)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      showToast('נשמר בהצלחה', 'success')
    } else {
      const { error } = await supabase.from('alignment_jobs').insert({ ...payload, status: 'waiting' })
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      showToast('עבודה נוספה', 'success')
    }
    setSaving(false)
    setShowModal(false)
    loadJobs()
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק את העבודה?', variant: 'danger' })
    if (!ok) return
    await supabase.from('alignment_jobs').delete().eq('id', id)
    showToast('נמחק', 'success')
    loadJobs()
  }

  // ── Copy link ─────────────────────────────────────────────────────────────────

  const handleCopyLink = (job: AlignmentJob) => {
    if (!job.track_token) { showToast('אין לינק מעקב', 'error'); return }
    const url = `${window.location.origin}/track/${job.track_token}`
    navigator.clipboard.writeText(url)
      .then(() => showToast('לינק הועתק ללוח', 'success'))
      .catch(() => showToast('שגיאה בהעתקה', 'error'))
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────────

  const handleWhatsApp = (job: AlignmentJob) => {
    if (!job.track_token || !job.customer_phone) {
      showToast('אין טלפון ללקוח', 'error')
      return
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const url    = `${origin}/track/${job.track_token}`
    const carInfo = [job.make, job.model].filter(Boolean).join(' ')
    const msg = `שלום ${job.customer_name},\nרכבך ${carInfo ? `(${carInfo}) ` : ''}לוחית ${job.plate} נמצא אצלנו לטיפול.\nלמעקב סטטוס: ${url}`
    const phone = job.customer_phone.replace(/\D/g, '')
    window.open(`https://wa.me/972${phone.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Excel / JSON ─────────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = jobs.map(j => ({ לוחית: j.plate, יצרן: j.make ?? '', דגם: j.model ?? '', לקוח: j.customer_name, טלפון: j.customer_phone, 'סוג עבודה': j.job_type, סטטוס: j.status, מחיר: j.price ?? '', טכנאי: j.technician ?? '', הערות: j.notes ?? '', תאריך: j.created_at?.slice(0, 10) }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'עבודות פרונט')
    XLSX.writeFile(wb, 'פרונט.xlsx')
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'פרונט.json'; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const visibleJobs = statusFilter === 'all'
    ? jobs
    : jobs.filter(j => j.status === statusFilter)

  const activeCount = jobs.filter(j => j.status !== 'delivered').length

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>טוען...</div>
  )

  return (
    <div style={{ padding: '20px', maxWidth: '960px', margin: '0 auto', direction: 'rtl' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>🔧 פרונט / כיוון צירים</h1>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {activeCount} עבודות פעילות
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExcelMenu onExportExcel={exportExcel} onExportJson={exportJson} />
          <Button onClick={openAdd}>+ עבודה חדשה</Button>
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Button size="sm"
          variant={statusFilter === 'all' ? 'primary' : 'secondary'}
          onClick={() => setStatusFilter('all')}
        >
          הכל ({jobs.length})
        </Button>
        {STATUSES.map(s => (
          <Button key={s.key} size="sm"
            variant={statusFilter === s.key ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter(s.key)}
            style={statusFilter === s.key ? { background: s.color, borderColor: s.color } : undefined}
          >
            {s.label} ({jobs.filter(j => j.status === s.key).length})
          </Button>
        ))}
      </div>

      {/* Cards */}
      {visibleJobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔧</div>
          אין עבודות{statusFilter !== 'all' ? ` בסטטוס זה` : ''}.<br />
          <span style={{ fontSize: '12px' }}>לחץ &quot;+ עבודה חדשה&quot; להוספה</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '12px' }}>
          {visibleJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onEdit={openEdit}
              onDelete={handleDelete}
              onWhatsApp={handleWhatsApp}
              onStatusChange={updateStatus}
              onCopyLink={handleCopyLink}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingJob ? 'עריכת עבודה' : 'עבודה חדשה'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <JobForm
          form={form}
          onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
          plateLoading={plateLoading}
          onPlateSearch={handlePlateSearch}
        />
      </Modal>
    </div>
  )
}
