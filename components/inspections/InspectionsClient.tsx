'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'
import InspectionChecklistModal, { ChecklistBadge, parseFindings, printChecklist } from './InspectionChecklistModal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Inspection {
  id: string
  tenant_id: string
  plate: string
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  fuel: string | null
  engine_cc: number | null
  chassis: string | null
  seats: number | null
  test_date: string | null
  km: string | null
  ownership_type: string | null
  owner_name: string
  owner_id: string | null
  owner_phone: string | null
  owner_address: string | null
  car_code: string | null
  date: string | null
  inspector: string | null
  findings: string | null
  status: 'draft' | 'completed'
  created_at: string
  drive_file_id: string | null
}

interface BusinessInfo {
  name: string
  sub_title: string | null
  logo: string | null
  phone: string | null
  address: string | null
  license_number: string | null
  tax_id: string | null
}

// ── Form state ─────────────────────────────────────────────────────────────────

const emptyForm = {
  plate: '',
  make: '', model: '', year: '', km: '', engine_cc: '', chassis: '',
  color: '', ownership_type: '',
  owner_name: '', owner_id: '', owner_phone: '', owner_address: '',
  car_code: '',
}

const VEHICLE_TYPES = ['מרכב אחיד', 'מרכב על שלדה', 'קבינה', 'מיני-בוס', 'אחר']

function todayStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ── Field label helper ─────────────────────────────────────────────────────────

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

// ── Section card ───────────────────────────────────────────────────────────────

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

// ── Print Component ────────────────────────────────────────────────────────────

interface PrintData { inspection: Inspection; business: BusinessInfo }

function PrintReport({ data }: { data: PrintData }) {
  const { inspection: ins, business: biz } = data
  const dateStr = ins.date || todayStr()
  const makeModel = [ins.make, ins.model].filter(Boolean).join(' ')

  return (
    <div id="print-inspection" style={{ visibility: 'hidden', position: 'absolute', top: 0, left: 0 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-inspection, #print-inspection * { visibility: visible !important; }
          #print-inspection { position: absolute; top: 0; left: 0; width: 100%; }
          @page { size: A4; margin: 0; }

          .pp { width:210mm; height:296mm; padding:10mm 15mm; box-sizing:border-box; font-family:'Heebo',Arial,sans-serif; direction:rtl; display:flex !important; flex-direction:column; position:relative; }
          .pp + .pp { page-break-before: always; }
          .pp-bsd { text-align:right; font-weight:bold; font-size:11px; margin-bottom:3px; }
          .pp-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:4mm; padding-bottom:4mm; border-bottom:2px solid #000; }
          .pp-biz { font-weight:bold; font-size:13px; line-height:1.4; }
          .pp-biz-name { font-size:16px; font-weight:900; }
          .pp-logo-wrap { text-align:center; }
          .pp-logo-wrap img { max-height:110px; max-width:240px; object-fit:contain; mix-blend-mode:multiply; filter:contrast(1.1); border:none; display:block; margin:0 auto; }
          .pp-logo-svc { font-size:9px; text-align:center; font-weight:bold; margin-top:4px; letter-spacing:0.5px; color:#333; }
          .pp-doc-titles { text-align:center; margin-bottom:4mm; }
          .pp-doc-titles h2 { font-size:12px; border-top:1px solid #000; border-bottom:1px solid #000; padding:3px 0; margin:4px 0; font-weight:bold; }
          .pp-doc-titles h1 { font-size:22px; margin:5px 0; text-decoration:underline; font-weight:900; }
          .pp-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-bottom:4mm; }
          .pp-info-section h3 { font-size:16px; border-bottom:2px solid #000; margin-bottom:5px; font-weight:900; }
          .pp-info-row { display:flex; align-items:baseline; margin-bottom:6px; font-size:14px; }
          .pp-info-row span { white-space:nowrap; font-weight:600; }
          .pp-line { border-bottom:1px solid #000; flex-grow:1; margin-right:6px; min-height:1.3em; font-weight:bold; padding:0 4px; }
          .pp-legal { font-size:13.5px; line-height:1.5; text-align:justify; flex-grow:1; }
          .pp-bullets { margin:8px 0; list-style-type:"❖ "; padding-right:20px; font-weight:bold; font-size:13px; }
          .pp-bullets li { margin-bottom:3px; }
          .pp-warn { border:2.5px solid #000; padding:8px 12px; margin:8px 0; background:#f5f5f5 !important; -webkit-print-color-adjust:exact; }
          .pp-warn h4 { margin:0 0 4px 0; text-decoration:underline; font-size:15px; }
          .pp-sig { margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; padding-top:8px; border-top:1px dashed #ccc; }
          .pp-sig-item { width:30%; text-align:center; font-size:13px; }
          .pp-sig-line { border-bottom:1.5px solid #000; margin-bottom:4px; min-height:1.5em; font-weight:bold; font-size:14px; }
          .pp-pagenum { position:absolute; bottom:8mm; left:15mm; font-size:10px; color:#999; }
          .pp-findings-title { font-size:16px; font-weight:900; margin:10px 0 6px; border-bottom:2px solid #000; padding-bottom:3px; }
          .pp-empty-line { border-bottom:1.5px solid #000; height:38px; margin-bottom:2px; }
          .pp-info-bar { display:flex; gap:0; border:2px solid #000; font-size:12px; margin-bottom:5mm; }
          .pp-info-bar-lbl { padding:5px 10px; border-left:1px solid #000; background:#eee !important; font-weight:700; white-space:nowrap; -webkit-print-color-adjust:exact; }
          .pp-info-bar-val { padding:5px 10px; border-left:2px solid #000; font-weight:900; font-size:13px; }
          .pp-info-bar-val-flex { padding:5px 10px; border-left:2px solid #000; font-weight:700; flex:1; }
          .pp-info-bar-val-phone { padding:5px 10px; border-left:2px solid #000; flex:1; }
          .pp-info-bar-code { padding:5px 10px; min-width:50px; }
        }
      `}</style>

      {/* ── PAGE 1 ── */}
      <div className="pp">
        <div className="pp-bsd">בס&quot;ד</div>

        <div className="pp-hdr">
          <div className="pp-biz">
            <div className="pp-biz-name">{biz.name}</div>
            {biz.sub_title && <div style={{ fontSize: 12 }}>{biz.sub_title}</div>}
            {biz.address && <div>{biz.address}</div>}
            {biz.phone && <div>טל׳: {biz.phone}</div>}
            {biz.license_number && <div>מס׳ רישיון מוסך: {biz.license_number}</div>}
          </div>
          <div className="pp-logo-wrap">
            {biz.logo && <img src={biz.logo} alt="לוגו" />}
            <div className="pp-logo-svc">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
          </div>
        </div>

        <div className="pp-doc-titles">
          <h2>הצהרה על-פי הוראת נוהל מחייבת (2/98) של משרד התחבורה למדדים לבדיקת רכב לצרכי קניה ומכירה</h2>
          <h1>דו&quot;ח קליטה – בדיקת רכב</h1>
        </div>

        <div className="pp-info-grid">
          <div className="pp-info-section">
            <h3>פרטי הלקוח</h3>
            <div className="pp-info-row"><span>מס׳ רכב:</span><div className="pp-line">{ins.plate}</div></div>
            <div className="pp-info-row"><span>שם הלקוח:</span><div className="pp-line">{ins.owner_name}</div></div>
            <div className="pp-info-row"><span>כתובת:</span><div className="pp-line">{ins.owner_address || ''}</div></div>
            <div className="pp-info-row"><span>טלפון:</span><div className="pp-line">{ins.owner_phone || ''}</div></div>
          </div>
          <div className="pp-info-section">
            <h3>פרטי הרכב</h3>
            <div className="pp-info-row"><span>שנת ייצור:</span><div className="pp-line">{ins.year || ''}</div></div>
            <div className="pp-info-row"><span>תוצר הרכב:</span><div className="pp-line">{makeModel}</div></div>
            <div className="pp-info-row"><span>ק&quot;מ:</span><div className="pp-line">{ins.km || ''}</div></div>
            <div className="pp-info-row"><span>מס׳ מנוע:</span><div className="pp-line">{ins.engine_cc || ''}</div></div>
            <div className="pp-info-row"><span>מס׳ שילדה:</span><div className="pp-line">{ins.chassis || ''}</div></div>
          </div>
        </div>

        <div className="pp-legal">
          אני{' '}
          <span style={{ fontWeight: 'bold', borderBottom: '1px solid #000', padding: '0 12px', display: 'inline-block', minWidth: 130 }}>
            {ins.owner_name}
          </span>
          {' '}ת.ז.{' '}
          <span style={{ fontWeight: 'bold', borderBottom: '1px solid #000', padding: '0 12px', display: 'inline-block', minWidth: 100 }}>
            {ins.owner_id || ''}
          </span>
          <br /><br />
          מזמין בזאת את בדיקת הרכב אשר פרטיו מפורטים ברישיון הרכב. ידוע לי, כי הבדיקה הינה מכנית בלבד ותפקידה לבדוק את מצבו המכני של הרכב ומערכותיו.
          <br /><br />
          ידוע לי, כי מכון הבדיקה אינו אחראי בכל דרך שהיא לזיופים או שינויים כלשהם בנתונים ו/או במספרים כלשהם ברכב ו/או במסמכיו, לרבות ברישיון הרכב ולתוצאותיהם של הללו, וכי מכון הבדיקה מבצע הבדיקה בכפוף ובהסתמך על הצהרתי זו.
          <ul className="pp-bullets">
            <li>יש לבדוק תצרוכת שמן בנסיעה !!</li>
            <li>אין אחריות על מערכות אלקטרוניות, מחשבי הרכב וכריות אויר !</li>
            <li>מומלץ לבדוק את רציפות הטיפול לק&quot;מ.</li>
            <li>מומלץ לבדוק את מקוריות הרכב במשרד הרישוי.</li>
          </ul>
          <div className="pp-warn">
            <h4>⚠️ חשוב ביותר!!!</h4>
            עם גילוי ליקויים שלא נתגלו בבדיקה – אין אנו אחראים אם התיקון ו/או הבדיקה בוצעו במקום אחר לפני שהרכב נבדק על ידינו שנית.<br />
            החברה אינה אחראית על ליקויים או מגרעות אשר לא נתגלו בבדיקה זו כתוצאה מהעלמת ליקויים במתכוון.<br />
            דו&quot;ח זה יפה כוחו לגבי מזמין הבדיקה בלבד.
          </div>
          <p style={{ marginTop: 8, fontSize: 13 }}>
            אני{' '}
            <span style={{ display: 'inline-block', width: 160, borderBottom: '1px solid #000' }} />
            {' '}מצהיר/ה בזאת כי הוסברו לי כל הליקויים המתייחסים לדו&quot;ח זה על כל חלקיו.
          </p>
        </div>

        <div className="pp-sig">
          <div className="pp-sig-item"><div className="pp-sig-line">{dateStr}</div><span>תאריך</span></div>
          <div className="pp-sig-item"><div className="pp-sig-line" /><span>חתימת מזמין הבדיקה</span></div>
          <div className="pp-sig-item"><div className="pp-sig-line" /><span>חתימת הבודק</span></div>
        </div>
        <div className="pp-pagenum">עמוד 1 מתוך 2</div>
      </div>

      {/* ── PAGE 2 ── */}
      <div className="pp">
        <div className="pp-bsd">בס&quot;ד</div>

        <div className="pp-hdr">
          <div className="pp-biz">
            <div className="pp-biz-name">{biz.name}</div>
            {biz.sub_title && <div style={{ fontSize: 12 }}>{biz.sub_title}</div>}
            {biz.address && <div>{biz.address}</div>}
            {biz.phone && <div>טל׳: {biz.phone}</div>}
            {biz.license_number && <div>מס׳ רישיון מוסך: {biz.license_number}</div>}
          </div>
          <div className="pp-logo-wrap">
            {biz.logo && <img src={biz.logo} alt="לוגו" />}
            <div className="pp-logo-svc">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
          </div>
        </div>

        <h1 style={{ textAlign: 'center', textDecoration: 'underline', fontSize: 22, margin: '0 0 4mm', fontWeight: 900 }}>
          טופס ממצאי בדיקה
        </h1>

        <div className="pp-info-bar">
          <div className="pp-info-bar-lbl">מס׳ רכב</div>
          <div className="pp-info-bar-val">{ins.plate}</div>
          <div className="pp-info-bar-lbl">שם לקוח</div>
          <div className="pp-info-bar-val-flex">{ins.owner_name}</div>
          <div className="pp-info-bar-lbl">טלפון</div>
          <div className="pp-info-bar-val-phone">{ins.owner_phone || ''}</div>
          <div className="pp-info-bar-lbl" style={{ borderLeft: 'none' }}>קוד</div>
          <div className="pp-info-bar-code">{ins.car_code || ''}</div>
        </div>

        <div className="pp-findings-title">פירוט ליקויים והערות:</div>
        <div>
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="pp-empty-line" />
          ))}
        </div>

        <div className="pp-pagenum">עמוד 2 מתוך 2</div>
      </div>
    </div>
  )
}

// ── Copy cell helper ──────────────────────────────────────────────────────────

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
        <button
          onClick={copy}
          title="העתק"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '1px 3px', borderRadius: 4, fontSize: 11,
            color: copied ? 'var(--primary)' : 'var(--text-muted)',
            opacity: 0.6, flexShrink: 0, lineHeight: 1,
          }}
        >
          {copied ? '✓' : '⧉'}
        </button>
      )}
    </span>
  )
}

// ── Row action button ──────────────────────────────────────────────────────────

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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function InspectionsClient() {
  const supabase    = useRef(createClient()).current
  const tenantId    = useRef<string | null>(null)
  const bizInfo     = useRef<BusinessInfo>({ name: 'אוטוליין', sub_title: null, logo: null, phone: null, address: null, license_number: null, tax_id: null })
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<'entry' | 'history'>('entry')
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState({ ...emptyForm })
  const [saving, setSaving]           = useState(false)
  const [plateLoading, setPlateLoading] = useState(false)
  const [printData, setPrintData]     = useState<PrintData | null>(null)
  const [search, setSearch]           = useState('')
  const [showActions, setShowActions] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const [driveConnected, setDriveConnected] = useState(false)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [uploadingId,    setUploadingId]    = useState<string | null>(null)
  const [scanningInsId,  setScanningInsId]  = useState<string | null>(null)
  const [editModalOpen,  setEditModalOpen]  = useState(false)
  const [checklistIns,   setChecklistIns]  = useState<Inspection | null>(null)
  const [findingsMenuId, setFindingsMenuId] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadInspections = useCallback(async () => {
    if (!tenantId.current) return
    const { data } = await supabase
      .from('car_inspections')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .order('created_at', { ascending: false })
    setInspections(data ?? [])
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('tenant_id, role').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      tenantId.current = profile.tenant_id
      setIsAdmin(profile.role === 'admin')

      fetch(`/api/drive/status?tenant_id=${profile.tenant_id}`)
        .then(r => r.json()).then(d => setDriveConnected(d.connected)).catch(() => {})

      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, sub_title, logo_base64, phone, address, license_number, tax_id')
        .eq('id', profile.tenant_id)
        .maybeSingle()
      if (tenant) {
        bizInfo.current = {
          name:           tenant.name ?? 'אוטוליין',
          sub_title:      tenant.sub_title ?? null,
          logo:           tenant.logo_base64 ?? null,
          phone:          tenant.phone ?? null,
          address:        tenant.address ?? null,
          license_number: tenant.license_number ?? null,
          tax_id:         tenant.tax_id ?? null,
        }
      }

      await loadInspections()
      setLoading(false)
    }
    init()
  }, [supabase, loadInspections])

  // ── Plate search ────────────────────────────────────────────────────────────

  const handlePlateSearch = async () => {
    if (!form.plate) return
    setPlateLoading(true)
    const data = await fetchVehicleByPlate(form.plate)
    if (data) {
      setForm(f => ({
        ...f,
        make:    data.make    ?? f.make,
        model:   data.model   ?? f.model,
        year:    data.year    ? String(data.year) : f.year,
        chassis: data.chassis ?? f.chassis,
        color:   data.color   ?? f.color,
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
    setFieldErrors(new Set())
    setEditModalOpen(false)
  }

  const openEdit = (ins: Inspection) => {
    setEditingId(ins.id)
    setForm({
      plate:          ins.plate,
      make:           ins.make           ?? '',
      model:          ins.model          ?? '',
      year:           ins.year           ? String(ins.year) : '',
      km:             ins.km             ?? '',
      engine_cc:      ins.engine_cc      ? String(ins.engine_cc) : '',
      chassis:        ins.chassis        ?? '',
      color:          ins.color          ?? '',
      ownership_type: ins.ownership_type ?? '',
      owner_name:     ins.owner_name,
      owner_id:       ins.owner_id       ?? '',
      owner_phone:    ins.owner_phone    ?? '',
      owner_address:  ins.owner_address  ?? '',
      car_code:       ins.car_code       ?? '',
    })
    setEditModalOpen(true)
  }

  // ── Save + Print ─────────────────────────────────────────────────────────────

  const handlePrintAndSave = async () => {
    const errors = new Set<string>()
    if (!form.plate.trim()) errors.add('plate')
    if (!form.owner_name.trim()) errors.add('owner_name')
    if (errors.size > 0) {
      setFieldErrors(errors)
      const labels = [...errors].map(f => f === 'plate' ? 'מספר רכב' : 'שם לקוח').join(', ')
      showToast(`שדות חובה חסרים: ${labels}`, 'error')
      return
    }
    setFieldErrors(new Set())
    setSaving(true)

    const payload = {
      tenant_id:    tenantId.current,
      plate:        form.plate.trim(),
      make:         form.make.trim()      || null,
      model:        form.model.trim()     || null,
      year:         form.year             ? Number(form.year)       : null,
      km:           form.km.trim()        || null,
      engine_cc:    form.engine_cc        ? Number(form.engine_cc)  : null,
      chassis:        form.chassis.trim()        || null,
      color:          form.color.trim()          || null,
      ownership_type: form.ownership_type.trim() || null,
      owner_name:     form.owner_name.trim(),
      owner_id:     form.owner_id.trim()       || null,
      owner_phone:  form.owner_phone.trim()    || null,
      owner_address: form.owner_address.trim() || null,
      car_code:     form.car_code.trim()       || null,
      date:         todayStr(),
      status:       'completed' as const,
    }

    let saved: Inspection | null = null

    if (editingId) {
      const { data, error } = await supabase
        .from('car_inspections').update(payload).eq('id', editingId).select().single()
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      saved = data
    } else {
      const { data, error } = await supabase
        .from('car_inspections').insert(payload).select().single()
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
      saved = data
    }

    setSaving(false)
    loadInspections()
    clearForm()

    if (saved) {
      setPrintData({ inspection: saved, business: bizInfo.current })
      setTimeout(() => window.print(), 150)
    }
  }

  // ── Save only (no print) ─────────────────────────────────────────────────────

  const handleSaveOnly = async () => {
    const errors = new Set<string>()
    if (!form.plate.trim()) errors.add('plate')
    if (!form.owner_name.trim()) errors.add('owner_name')
    if (errors.size > 0) {
      setFieldErrors(errors)
      const labels = [...errors].map(f => f === 'plate' ? 'מספר רכב' : 'שם לקוח').join(', ')
      showToast(`שדות חובה חסרים: ${labels}`, 'error')
      return
    }
    setFieldErrors(new Set())
    setSaving(true)

    const payload = {
      tenant_id:    tenantId.current,
      plate:        form.plate.trim(),
      make:         form.make.trim()      || null,
      model:        form.model.trim()     || null,
      year:         form.year             ? Number(form.year)       : null,
      km:           form.km.trim()        || null,
      engine_cc:    form.engine_cc        ? Number(form.engine_cc)  : null,
      chassis:        form.chassis.trim()        || null,
      color:          form.color.trim()          || null,
      ownership_type: form.ownership_type.trim() || null,
      owner_name:     form.owner_name.trim(),
      owner_id:     form.owner_id.trim()       || null,
      owner_phone:  form.owner_phone.trim()    || null,
      owner_address: form.owner_address.trim() || null,
      car_code:     form.car_code.trim()       || null,
      date:         todayStr(),
      status:       'completed' as const,
    }

    if (editingId) {
      const { error } = await supabase
        .from('car_inspections').update(payload).eq('id', editingId)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
    } else {
      const { error } = await supabase
        .from('car_inspections').insert(payload)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }
    }

    setSaving(false)
    showToast('נשמר בהצלחה', 'success')
    loadInspections()
    clearForm()
  }

  // ── Save checklist ───────────────────────────────────────────────────────────

  const saveChecklist = async (insId: string, findings: string) => {
    await supabase.from('car_inspections').update({ findings }).eq('id', insId)
    setInspections(prev => prev.map(i => i.id === insId ? { ...i, findings } : i))
    showToast('ממצאים נשמרו ✓', 'success')
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק את הבדיקה?', variant: 'danger' })
    if (!ok) return
    await supabase.from('car_inspections').delete().eq('id', id)
    showToast('נמחק', 'success')
    loadInspections()
  }

  // ── Print existing ───────────────────────────────────────────────────────────

  const handlePrint = (ins: Inspection) => {
    setPrintData({ inspection: ins, business: bizInfo.current })
    setTimeout(() => window.print(), 100)
  }

  // ── Print checklist (direct from list) ──────────────────────────────────────

  const printChecklistFromList = (ins: Inspection) => {
    const { items, notes } = parseFindings(ins.findings)
    printChecklist(ins, bizInfo.current, items, notes)
  }

  // ── Clear findings ───────────────────────────────────────────────────────────

  const clearFindings = async (id: string) => {
    const ok = await confirm({ msg: 'לאפס את כל ממצאי הבדיקה?', variant: 'danger' })
    if (!ok) return
    await supabase.from('car_inspections').update({ findings: null }).eq('id', id)
    setInspections(prev => prev.map(i => i.id === id ? { ...i, findings: null } : i))
    showToast('הממצאים אופסו', 'success')
  }

  // ── Drive upload ─────────────────────────────────────────────────────────────

  const uploadInspectionFile = async (ins: Inspection, file: File) => {
    if (!tenantId.current) return
    setUploadingId(ins.id)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tenant_id', tenantId.current)
      fd.append('sub_folder', 'בדיקות קניה')
      fd.append('item_name', `${ins.plate}_${ins.date ?? ins.created_at?.slice(0, 10) ?? 'scan'}`)
      const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { id: fileId } = await res.json()
      if (!fileId) throw new Error('לא התקבל מזהה קובץ מדרייב')
      await supabase.from('car_inspections').update({ drive_file_id: fileId }).eq('id', ins.id)
      showToast('הקובץ הועלה לדרייב ✓', 'success')
      loadInspections()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      console.error('Drive upload failed:', msg)
      showToast(`שגיאה בהעלאה: ${msg}`, 'error')
    } finally {
      setUploadingId(null)
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = inspections.filter(ins => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      ins.plate.toLowerCase().includes(q)      ||
      ins.owner_name.toLowerCase().includes(q) ||
      (ins.owner_phone   ?? '').includes(q)    ||
      (ins.owner_id      ?? '').includes(q)    ||
      (ins.chassis       ?? '').toLowerCase().includes(q) ||
      (ins.make          ?? '').toLowerCase().includes(q)
    )
  })

  const onChange = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (fieldErrors.has(k)) setFieldErrors(s => { const n = new Set(s); n.delete(k); return n })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-muted)' }}>טוען...</div>
  }

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Print area */}
      {printData && <PrintReport data={printData} />}

      {/* Page title */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#10b981,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px #10b98144' }}><svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>בדיקות קניה</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{inspections.length} בדיקות שמורות</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="scroll-x" style={{ marginBottom: 24 }}><div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
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
      </div></div>

      {/* ── TAB: הזנת נתונים ── */}
      {tab === 'entry' && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Two-column layout: customer | vehicle */}
          <div className="inspections-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

            {/* Customer section */}
            <Section icon="👤" title="פרטי לקוח">
              <div className="inspections-customer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {[
                  { key: 'owner_name',    label: 'שם לקוח *',  placeholder: 'ישראל ישראלי' },
                  { key: 'owner_id',      label: 'תעודת זהות', placeholder: '123456789' },
                  { key: 'owner_phone',   label: 'טלפון',       placeholder: '050-0000000' },
                  { key: 'owner_address', label: 'כתובת',       placeholder: 'רחוב, עיר' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <FL>{label}</FL>
                    <input
                      value={form[key as keyof typeof emptyForm]}
                      onChange={e => onChange(key, e.target.value)}
                      className="form-input"
                      placeholder={placeholder}
                      style={fieldErrors.has(key) ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(220,38,38,.15)' } : undefined}
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* Vehicle section */}
            <Section icon="🚗" title="פרטי רכב">
              {/* Plate + auto-fill */}
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

              {/* Vehicle fields grid */}
              <div className="inspections-vehicle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { key: 'make',      label: 'תוצר',       placeholder: 'טויוטה' },
                  { key: 'model',     label: 'דגם',         placeholder: 'קורולה' },
                  { key: 'year',      label: 'שנת ייצור',   placeholder: '2020' },
                  { key: 'km',        label: 'ק"מ',         placeholder: '100000' },
                  { key: 'color',     label: 'צבע',         placeholder: '' },
                  { key: 'engine_cc', label: 'מספר מנוע',   placeholder: '' },
                  { key: 'chassis',   label: 'מספר שלדה',   placeholder: '' },
                  { key: 'car_code',  label: 'קוד רכב',     placeholder: '' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <FL>{label}</FL>
                    <input
                      value={form[key as keyof typeof emptyForm]}
                      onChange={e => onChange(key, e.target.value)}
                      className="form-input"
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div>
                  <FL>סוג רכב</FL>
                  <select
                    value={form.ownership_type}
                    onChange={e => onChange('ownership_type', e.target.value)}
                    className="form-input"
                  >
                    <option value="">— בחר —</option>
                    {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </Section>
          </div>

          {/* Action bar – always visible at bottom */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 18px',
            flexShrink: 0,
          }}>
            <Button
              fullWidth
              onClick={handlePrintAndSave}
              disabled={saving}
              style={{ fontSize: 15, fontWeight: 800, padding: '10px 0' }}
            >
              {saving ? 'שומר...' : '🖨️ הדפס מסמך ושמור'}
            </Button>
            {editingId && (
              <Button
                variant="secondary"
                onClick={handleSaveOnly}
                disabled={saving}
                style={{ flexShrink: 0, padding: '10px 20px', whiteSpace: 'nowrap', fontWeight: 700 }}
              >
                💾 שמור ללא הדפסה
              </Button>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>מאגר בדיקות</span>
              <span style={{ fontSize: 18 }}>📋</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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
              <Button variant="primary" size="sm">
                📊 ייצוא לאקסל
              </Button>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 12, pointerEvents: 'none', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input-global"
              placeholder="חיפוש לפי שם, מספר רכב, טלפון, שלדה..."
              style={{ paddingRight: 34 }}
            />
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700 }}>אין בדיקות עדיין</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>עבור לטאב &quot;הזנת נתונים&quot; להתחלה</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(ins => (
                <div key={ins.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {/* Header: plate + date */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      background: 'var(--primary-light,#e8f7f0)', color: 'var(--primary)',
                      fontWeight: 800, fontFamily: 'monospace', padding: '3px 10px',
                      borderRadius: 6, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      🚗 <CopyCell value={ins.plate} />
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {ins.date || ins.created_at?.slice(0, 10) || ''}
                    </span>
                  </div>

                  {/* Owner name + phone */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                      <CopyCell value={ins.owner_name} />
                    </span>
                    {ins.owner_phone && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', direction: 'ltr', flexShrink: 0 }}>
                        <CopyCell value={ins.owner_phone} />
                      </span>
                    )}
                  </div>

                  {/* Vehicle info */}
                  {(ins.make || ins.year || ins.km) && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {ins.make && <span>{ins.make}</span>}
                      {ins.year && <span>{ins.year}</span>}
                      {ins.km && <span>{Number(ins.km).toLocaleString()} ק&quot;מ</span>}
                    </div>
                  )}

                  {/* Extra: owner_id / address / engine / chassis */}
                  {(ins.owner_id || ins.owner_address || ins.engine_cc || ins.chassis) && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {ins.owner_id    && <span>ת.ז: <CopyCell value={ins.owner_id} /></span>}
                      {ins.engine_cc   && <span>מנוע: <CopyCell value={ins.engine_cc} /></span>}
                      {ins.chassis     && <span>שלדה: {ins.chassis}</span>}
                      {ins.owner_address && <span>{ins.owner_address}</span>}
                    </div>
                  )}

                  {/* Checklist badge + action menu */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <ChecklistBadge findings={ins.findings} />
                    {findingsMenuId === ins.id ? (
                      <>
                        <button onClick={() => { setChecklistIns(ins); setFindingsMenuId(null) }}
                          style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1.5px solid var(--primary)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
                          ✏️ ערוך
                        </button>
                        <button onClick={() => { printChecklistFromList(ins); setFindingsMenuId(null) }}
                          style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', cursor: 'pointer' }}>
                          🖨️ הדפס
                        </button>
                        <button onClick={() => { clearFindings(ins.id); setFindingsMenuId(null) }}
                          style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--danger)', background: '#fef2f2', color: 'var(--danger)', cursor: 'pointer' }}>
                          🗑️ מחק ממצאים
                        </button>
                        <button onClick={() => setFindingsMenuId(null)}
                          style={{ padding: '4px 8px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setFindingsMenuId(ins.id)}
                        style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
                        📋 ממצאי בדיקה
                      </button>
                    )}
                  </div>

                  {/* Footer: drive + actions */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    {ins.drive_file_id ? (
                      <a
                        href={`https://drive.google.com/file/d/${ins.drive_file_id}/view`}
                        target="_blank" rel="noreferrer"
                        title="פתח בדרייב"
                        style={{ fontSize: 18, textDecoration: 'none' }}
                      >📄</a>
                    ) : isAdmin && driveConnected ? (
                      <>
                        <input
                          type="file" accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          id={`drive-upload-${ins.id}`}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadInspectionFile(ins, f); e.target.value = '' }}
                        />
                        <label
                          htmlFor={`drive-upload-${ins.id}`}
                          title="העלה קובץ לדרייב"
                          style={{ cursor: uploadingId === ins.id ? 'default' : 'pointer', fontSize: 18 }}
                        >
                          {uploadingId === ins.id ? '⏳' : '📤'}
                        </label>
                        <button
                          onClick={() => setScanningInsId(ins.id)}
                          title="סרוק מסמך"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0 }}
                        >📷</button>
                        {scanningInsId === ins.id && (
                          <DocumentScannerModal
                            onComplete={file => { setScanningInsId(null); uploadInspectionFile(ins, file) }}
                            onClose={() => setScanningInsId(null)}
                          />
                        )}
                      </>
                    ) : null}

                    <div style={{ flex: 1 }} />

                    {showActions && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <ActionBtn onClick={() => openEdit(ins)} title="עריכה">✏️</ActionBtn>
                        <ActionBtn onClick={() => handlePrint(ins)} title="הדפס">🖨️</ActionBtn>
                        <ActionBtn onClick={() => handleDelete(ins.id)} title="מחיקה">🗑️</ActionBtn>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Checklist Modal ── */}
      {checklistIns && (
        <InspectionChecklistModal
          inspection={checklistIns}
          business={bizInfo.current}
          onClose={() => setChecklistIns(null)}
          onSave={saveChecklist}
        />
      )}

      {/* ── Edit Modal ── */}
      {editModalOpen && (
        <>
          {/* Backdrop */}
          <div onClick={clearForm} style={{
            position: 'fixed', inset: 0, zIndex: 499,
            background: 'rgba(0,0,0,0.45)',
          }} />

          {/* Drawer panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: '100%', maxWidth: 720,
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
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>עריכת בדיקה</span>
            </div>

            {/* Form */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="inspections-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

                <Section icon="👤" title="פרטי לקוח">
                  <div className="inspections-customer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    {[
                      { key: 'owner_name',    label: 'שם לקוח *',  placeholder: 'ישראל ישראלי' },
                      { key: 'owner_id',      label: 'תעודת זהות', placeholder: '123456789' },
                      { key: 'owner_phone',   label: 'טלפון',       placeholder: '050-0000000' },
                      { key: 'owner_address', label: 'כתובת',       placeholder: 'רחוב, עיר' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <FL>{label}</FL>
                        <input
                          value={form[key as keyof typeof emptyForm]}
                          onChange={e => onChange(key, e.target.value)}
                          className="form-input"
                          placeholder={placeholder}
                          style={fieldErrors.has(key) ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(220,38,38,.15)' } : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </Section>

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
                  <div className="inspections-vehicle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[
                      { key: 'make',      label: 'תוצר',      placeholder: 'טויוטה' },
                      { key: 'model',     label: 'דגם',        placeholder: 'קורולה' },
                      { key: 'year',      label: 'שנת ייצור',  placeholder: '2020' },
                      { key: 'km',        label: 'ק"מ',        placeholder: '100000' },
                      { key: 'color',     label: 'צבע',        placeholder: '' },
                      { key: 'engine_cc', label: 'מספר מנוע',  placeholder: '' },
                      { key: 'chassis',   label: 'מספר שלדה',  placeholder: '' },
                      { key: 'car_code',  label: 'קוד רכב',    placeholder: '' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <FL>{label}</FL>
                        <input
                          value={form[key as keyof typeof emptyForm]}
                          onChange={e => onChange(key, e.target.value)}
                          className="form-input"
                          placeholder={placeholder}
                        />
                      </div>
                    ))}
                    <div>
                      <FL>סוג רכב</FL>
                      <select
                        value={form.ownership_type}
                        onChange={e => onChange('ownership_type', e.target.value)}
                        className="form-input"
                      >
                        <option value="">— בחר —</option>
                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </Section>
              </div>

              {/* Action bar */}
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '12px 18px',
                position: 'sticky', bottom: 0,
              }}>
                <Button fullWidth onClick={handlePrintAndSave} disabled={saving}
                  style={{ fontSize: 15, fontWeight: 800, padding: '10px 0' }}>
                  {saving ? 'שומר...' : '🖨️ הדפס ושמור'}
                </Button>
                <Button variant="secondary" onClick={handleSaveOnly} disabled={saving}
                  style={{ flexShrink: 0, padding: '10px 20px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                  💾 שמור
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
