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

type JobStatus = 'waiting' | 'in_progress' | 'done' | 'delivered' | 'cancelled'

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
  external_supplier: string | null
  work_order_number: number | null
  created_at: string
  updated_at: string
}

interface BizInfo {
  name: string
  sub_title: string | null
  logo: string | null
  phone: string | null
  address: string | null
  license_number: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES: { key: JobStatus; label: string; color: string; bg: string }[] = [
  { key: 'waiting',     label: '⏳ ממתין',  color: '#92400e', bg: '#fef3c7' },
  { key: 'in_progress', label: '🔧 בטיפול', color: '#1e40af', bg: '#dbeafe' },
  { key: 'done',        label: '✅ הושלם',  color: '#065f46', bg: '#d1fae5' },
  { key: 'delivered',   label: '🚗 נמסר',   color: '#6b7280', bg: '#f3f4f6' },
  { key: 'cancelled',   label: '🚫 בוטל',   color: '#991b1b', bg: '#fee2e2' },
]

// ── Job type tags (independent toggles) ───────────────────────────────────────

function parseJobTags(jt: string) {
  return {
    kadmi:  jt.includes('קדמי'),
    achori: jt.includes('אחורי'),
    izun:   jt.includes('איזון'),
    acher:  jt === 'אחר',
  }
}

function buildJobType(t: ReturnType<typeof parseJobTags>): string {
  if (t.acher) return 'אחר'
  const parts: string[] = []
  if (t.kadmi && t.achori) parts.push('כיוון פרונט קדמי + אחורי')
  else if (t.kadmi)        parts.push('כיוון פרונט קדמי')
  else if (t.achori)       parts.push('כיוון פרונט אחורי')
  if (t.izun)              parts.push('איזון גלגלים')
  return parts.join(' + ') || 'כיוון פרונט קדמי'
}

const emptyForm = {
  plate: '', customer_name: '', customer_phone: '',
  make: '', model: '', year: '', color: '',
  job_type: 'כיוון פרונט קדמי', notes: '', technician: '', price: '',
  external_supplier: '',
}

function todayStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function printWorkOrder(job: AlignmentJob, biz: BizInfo) {
  const woNum   = job.work_order_number ? `WO-${String(job.work_order_number).padStart(4,'0')}` : '—'
  const dateStr = todayStr()
  const makeModel = [job.make, job.model].filter(Boolean).join(' ')
  const logoHTML  = biz.logo
    ? `<img src="${biz.logo}" style="max-height:28mm;max-width:60mm;object-fit:contain;display:block;mix-blend-mode:multiply">`
    : `<div style="width:60mm;height:28mm;border:1.5px dashed #bbb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#bbb">לוגו</div>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 portrait;margin:0}
  body{font-family:Arial,'Heebo',sans-serif;direction:rtl;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pp{width:210mm;min-height:297mm;padding:12mm 15mm 15mm;display:flex;flex-direction:column;position:relative;font-size:13px;color:#111}
  .bsd{text-align:right;font-weight:bold;font-size:10px;margin-bottom:3px;color:#444}
  .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #000;padding-bottom:5mm;margin-bottom:4mm}
  .biz-name{font-size:17px;font-weight:900}
  .biz-line{font-size:11px;color:#444;line-height:1.7;margin-top:3px}
  .doc-title{text-align:center;font-size:22px;font-weight:900;text-decoration:underline;margin-bottom:5mm}
  .info-bar{display:flex;border:2px solid #000;font-size:12px;margin-bottom:5mm}
  .ibc{display:flex;align-items:center;border-left:1.5px solid #000;padding:4px 10px}
  .ibc:last-child{border-left:none;flex:1}
  .ibc .lbl{font-weight:700;white-space:nowrap;margin-left:6px;color:#444}
  .ibc .val{font-weight:900;font-size:13px}
  .ibc.serial{background:#f0f0f0}
  .sup-box{border:2px solid #000;padding:5px 10px;margin-bottom:5mm;display:flex;align-items:center}
  .sup-box .lbl{font-weight:700;font-size:13px;white-space:nowrap;margin-left:10px;border-left:1.5px solid #000;padding-left:10px}
  .sup-box .val{font-weight:900;font-size:14px;flex:1;border-bottom:1px solid #000;padding:0 4px;min-height:1.2em}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm}
  .sec h3{font-size:15px;font-weight:900;border-bottom:2px solid #000;margin-bottom:4px;padding-bottom:2px}
  .row{display:flex;align-items:baseline;margin-bottom:5px;font-size:12.5px}
  .row .lbl{white-space:nowrap;font-weight:600;margin-left:5px}
  .row .line{border-bottom:1px solid #000;flex-grow:1;min-height:1.2em;font-weight:700;padding:0 3px;font-size:13px}
  .sec-full{margin-bottom:5mm}
  .sec-full h3{font-size:15px;font-weight:900;border-bottom:2px solid #000;margin-bottom:5px;padding-bottom:2px}
  .eline{border-bottom:1.5px solid #000;height:9mm;margin-bottom:2px}
  .notes-box{border:1.5px solid #555;padding:5px 8px;min-height:18mm;font-size:12px;color:#999}
  .sigs{display:flex;justify-content:space-between;margin-top:auto;padding-top:6mm;border-top:1px dashed #888}
  .sig-item{width:30%;text-align:center;font-size:12px}
  .sig-line{border-bottom:1.5px solid #000;min-height:14mm;margin-bottom:4px}
  .sig-label{font-weight:600;font-size:11px;color:#444}
  .pagenum{position:absolute;bottom:8mm;left:15mm;font-size:9px;color:#aaa}
</style>
</head>
<body>
<div class="pp">
  <div class="bsd">בס"ד</div>
  <div class="hdr">
    <div>
      <div class="biz-name">${biz.name}</div>
      ${biz.sub_title ? `<div style="font-size:11px;color:#333;margin-top:2px">${biz.sub_title}</div>` : ''}
      <div class="biz-line">
        ${biz.address ? biz.address + '<br>' : ''}
        ${biz.phone   ? `טל׳: ${biz.phone}` : ''}
        ${biz.license_number ? `&nbsp;|&nbsp;רישיון מוסך: ${biz.license_number}` : ''}
      </div>
    </div>
    ${logoHTML}
  </div>

  <div class="doc-title">הזמנת עבודה חיצונית</div>

  <div class="info-bar">
    <div class="ibc serial"><span class="lbl">מס׳ הזמנה:</span><span class="val">${woNum}</span></div>
    <div class="ibc"><span class="lbl">תאריך:</span><span class="val">${dateStr}</span></div>
    <div class="ibc"><span class="lbl">מס׳ רכב:</span><span class="val">${job.plate}</span></div>
  </div>

  <div class="sup-box">
    <span class="lbl">שם הספק / מוסך:</span>
    <span class="val">${job.external_supplier || ''}</span>
  </div>

  <div class="two-col">
    <div class="sec">
      <h3>פרטי הלקוח</h3>
      <div class="row"><span class="lbl">שם:</span><div class="line">${job.customer_name}</div></div>
      <div class="row"><span class="lbl">טלפון:</span><div class="line">${job.customer_phone || ''}</div></div>
    </div>
    <div class="sec">
      <h3>פרטי הרכב</h3>
      <div class="row"><span class="lbl">יצרן / דגם:</span><div class="line">${makeModel}</div></div>
      <div class="row"><span class="lbl">שנה:</span><div class="line">${job.year || ''}</div></div>
      <div class="row"><span class="lbl">צבע:</span><div class="line">${job.color || ''}</div></div>
    </div>
  </div>

  <div class="sec-full">
    <h3>תיאור העבודה הנדרשת</h3>
    <div class="eline" style="padding:2px 4px;font-size:12px">${job.job_type}</div>
    <div class="eline"></div>
    <div class="eline"></div>
  </div>

  <div class="sec-full">
    <h3>הערות</h3>
    <div class="notes-box">${job.notes || ''}</div>
  </div>

  <div class="sigs">
    <div class="sig-item"><div class="sig-line"></div><div class="sig-label">שם הספק המבצע</div></div>
    <div class="sig-item"><div class="sig-line"></div><div class="sig-label">חתימת המוסך המזמין</div></div>
  </div>

  <div class="pagenum">הופק ממערכת AutoFlow</div>
</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const selSt: React.CSSProperties = {
  padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '9px',
  fontSize: '14px', background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', width: '100%',
}
const labelSt: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px',
}
const areaSt: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '9px',
  fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#f8fafc',
}

// ── Job Card ───────────────────────────────────────────────────────────────────

function JobCard({
  job, onEdit, onDelete, onWhatsApp, onStatusChange, onCopyLink, onPrint,
}: {
  job: AlignmentJob
  onEdit: (job: AlignmentJob) => void
  onDelete: (id: string) => void
  onWhatsApp: (job: AlignmentJob) => void
  onStatusChange: (id: string, status: JobStatus) => void
  onCopyLink: (job: AlignmentJob) => void
  onPrint: (job: AlignmentJob) => void
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

        {/* Supplier */}
        {job.external_supplier && (
          <div style={{
            fontSize: '12px', color: '#6d28d9', fontWeight: 600,
            paddingTop: '4px',
          }}>
            🏪 {job.external_supplier}
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
          <Button size="sm" variant="secondary" onClick={() => onPrint(job)}>🖨️</Button>
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

      {/* Job type – all independent toggles */}
      <div>
        <label style={labelSt}>סוג עבודה *</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
          {([
            { label: 'פרונט קדמי',    tag: 'kadmi',  color: 'var(--primary)' },
            { label: 'פרונט אחורי',   tag: 'achori', color: 'var(--primary)' },
            { label: 'איזון גלגלים',  tag: 'izun',   color: 'var(--accent)'  },
            { label: 'אחר',           tag: 'acher',  color: 'var(--warning)' },
          ] as const).map(({ label, tag, color }) => {
            const tags   = parseJobTags(form.job_type)
            const active = tags[tag]
            const toggle = () => {
              const next = { ...parseJobTags(form.job_type) }
              if (tag === 'acher') {
                // "אחר" is standalone
                Object.assign(next, { kadmi: false, achori: false, izun: false, acher: !next.acher })
              } else {
                next[tag] = !next[tag]
                next.acher = false
              }
              onChange('job_type', buildJobType(next))
            }
            return (
              <button key={tag} type="button" onClick={toggle} style={{
                padding: '5px 14px', borderRadius: '20px',
                border: `1.5px solid ${active ? color : 'var(--border)'}`,
                background: active ? color : 'var(--bg)',
                color: active ? '#fff' : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>
                {label}
              </button>
            )
          })}
        </div>
        {form.job_type && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            נבחר: <strong style={{ color: 'var(--text)' }}>{form.job_type}</strong>
          </div>
        )}
      </div>

      <Input label="מחיר (₪)" value={form.price} onChange={e => onChange('price', e.target.value)} type="number" />

      <Input label="טכנאי" value={form.technician} onChange={e => onChange('technician', e.target.value)} />

      <Input
        label="ספק חיצוני (למילוי אם העבודה נשלחת החוצה)"
        value={form.external_supplier}
        onChange={e => onChange('external_supplier', e.target.value)}
        placeholder="שם מוסך / ספק..."
      />

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
  const bizInfo       = useRef<BizInfo>({ name: 'AutoFlow', sub_title: null, logo: null, phone: null, address: null, license_number: null })
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

        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, sub_title, logo_base64, phone, address, license_number')
          .eq('id', profile.tenant_id)
          .maybeSingle()
        if (tenant) {
          bizInfo.current = {
            name:           tenant.name ?? 'AutoFlow',
            sub_title:      tenant.sub_title ?? null,
            logo:           tenant.logo_base64 ?? null,
            phone:          tenant.phone ?? null,
            address:        tenant.address ?? null,
            license_number: tenant.license_number ?? null,
          }
        }

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
      plate:             job.plate,
      customer_name:     job.customer_name,
      customer_phone:    job.customer_phone ?? '',
      make:              job.make   ?? '',
      model:             job.model  ?? '',
      year:              job.year   ? String(job.year) : '',
      color:             job.color  ?? '',
      job_type:          job.job_type,
      notes:             job.notes  ?? '',
      technician:        job.technician ?? '',
      price:             job.price != null ? String(job.price) : '',
      external_supplier: job.external_supplier ?? '',
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
      tenant_id:         tenantId.current,
      plate:             form.plate.trim(),
      customer_name:     form.customer_name.trim(),
      customer_phone:    form.customer_phone.trim() || null,
      make:              form.make.trim()  || null,
      model:             form.model.trim() || null,
      year:              form.year  ? Number(form.year)  : null,
      color:             form.color.trim() || null,
      job_type:          form.job_type,
      notes:             form.notes.trim() || null,
      technician:        form.technician.trim() || null,
      price:             form.price ? Number(form.price) : null,
      external_supplier: form.external_supplier.trim() || null,
      updated_at:        new Date().toISOString(),
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px #6366f144' }}><svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg></div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>כיוון פרונט</h1>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{activeCount} עבודות פעילות</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExcelMenu onExportExcel={exportExcel} />
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
              onPrint={j => printWorkOrder(j, bizInfo.current)}
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
