'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import RowActionsMenu, { RowMenuAction } from '@/components/ui/RowActionsMenu'
import PlateInput from '@/components/ui/PlateInput'
import MoreMenu from '@/components/ui/MoreMenu'
import FilterBar from '@/components/ui/FilterBar'
import PageHeader from '@/components/ui/PageHeader'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { VehicleData } from '@/lib/utils/plateApi'
import { MAX_UPLOAD_BYTES, shrinkForUpload } from '@/lib/utils/uploadCompress'
import CarContractsPanel from './CarContractsPanel'
import CarContractEditor, { type ContractPrefill } from './CarContractEditor'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InterestedBuyer {
  id: string
  name: string
  phone?: string
  offered_price?: number
  notes?: string
  date: string
}

interface Car {
  id: string
  tenant_id: string
  plate: string | null
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  km: number | null
  condition: string
  status: string        // checking | available | reserved | business | sold
  buy_price: number | null
  ask_price: number | null
  sell_price: number | null
  test_date: string | null
  insur_date: string | null
  contact: string | null
  owner_name: string | null
  photos: string[]      // Drive IDs / URLs
  fuel_type: string | null
  seats: number | null
  sold_date: string | null
  sold_price: number | null
  buyer_name: string | null
  buyer_phone: string | null
  buyer_payment: string | null
  interested_buyers: InterestedBuyer[]
  reserved_for: string | null
  current_location: string | null
  hand: number | null
  original_ownership: string | null
  car_code: string | null
  test_fee_paid: boolean
  test_fee_paid_date: string | null
  test_passed: boolean
  test_passed_date: string | null
  gov_last_test_date: string | null
  doc_names: string[]
  license_deposited: boolean
  license_deposit_date: string | null
  deposit_refund_requested: boolean
  deposit_refund_requested_date: string | null
  notes: string | null
  created_at: string
}



// ── Constants ─────────────────────────────────────────────────────────────────

const CONDITIONS = [
  { value: 'new',      label: 'חדש' },
  { value: 'like-new', label: 'כמו חדש' },
  { value: 'good',     label: 'טוב' },
  { value: 'fair',     label: 'סביר' },
  { value: 'poor',     label: 'לשיפוץ' },
]
const COND_COLOR: Record<string, string> = {
  'new': '#166534', 'like-new': '#0369a1', 'good': 'var(--primary)', 'fair': '#b45309', 'poor': '#dc2626',
}

const STATUSES = [
  { value: 'checking',  label: '🔍 בדיקה',         color: '#0369a1' },
  { value: 'available', label: '🟢 למכירה',         color: 'var(--primary)' },
  { value: 'reserved',  label: '🟡 שמור',           color: '#d97706' },
  { value: 'business',  label: '🟣 בשימוש העסק',     color: '#7c3aed' },
  { value: 'sold',      label: '⚫ נמכר',           color: '#64748b' },
  { value: 'declined',  label: '❌ נדחה',           color: '#dc2626' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]))

const PAYMENT_METHODS = ['העברה', 'מזומן', "צ'ק", 'אשראי', 'מימון']

const emptyCarForm = {
  plate: '', make: '', model: '', year: '', color: '',
  km: '', condition: 'good', status: 'available',
  buy_price: '', ask_price: '', sell_price: '',
  test_date: '', insur_date: '',
  contact: '', owner_name: '',
  fuel_type: '', seats: '',
  reserved_for: '',
  current_location: '',
  hand: '', original_ownership: '', car_code: '',
  test_fee_paid: false, test_fee_paid_date: '',
  test_passed: false, test_passed_date: '',
  license_deposited: false,
  license_deposit_date: '',
  deposit_refund_requested: false,
  deposit_refund_requested_date: '',
  notes: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (!n) return '—'
  return '₪' + Math.round(n).toLocaleString('he-IL', { useGrouping: true })
}
function fmtKm(n: number | null | undefined) {
  if (!n) return null
  return n.toLocaleString('he-IL') + ' ק"מ'
}
function todayISO() { return new Date().toISOString().slice(0, 10) }

function extractDriveId(url: string): string {
  if (!url.trim()) return ''
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (m2) return m2[1]
  return url.trim()
}
function driveThumb(idOrUrl: string) {
  const id = extractDriveId(idOrUrl)
  if (!id) return ''
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`
}

function dateChipStyle(dateStr: string | null): { bg: string; color: string; label: string } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  if (days < 0)   return { bg: '#fee2e2', color: '#dc2626', label: `פג ${Math.abs(days)}י׳` }
  if (days <= 30) return { bg: '#fef9c3', color: '#92400e', label: `${days} ימים` }
  return { bg: 'var(--success-soft)', color: '#166534', label: dateStr }
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Document name as shown on the card: drop the "<plate> - " prefix and the extension. */
function docLabel(fileName: string, plate: string) {
  const noExt = fileName.replace(/\.[a-z0-9]{2,5}$/i, '')
  return plate && noExt.startsWith(`${plate} - `) ? noExt.slice(plate.length + 3) : noExt
}
function sameList(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}

/**
 * Changes to apply from the Ministry of Transport registry: tokef = license valid until,
 * lastTest = last track test. A later tokef means the renewal completed (fee + test) →
 * this cycle's checkboxes reset. A track test within 120 days of the current tokef (or after
 * it) counts as "passed this cycle". The registry has no fee-paid field — that stays manual.
 */
function govTestPatch(c: Car, g: { tokef: string | null; lastTest: string | null }): Partial<Car> {
  const p: Partial<Car> = {}
  if (g.lastTest && g.lastTest !== c.gov_last_test_date) p.gov_last_test_date = g.lastTest
  if (g.tokef && g.tokef !== c.test_date) {
    p.test_date = g.tokef
    if (c.test_date && g.tokef > c.test_date) {
      Object.assign(p, { test_fee_paid: false, test_fee_paid_date: null, test_passed: false, test_passed_date: null })
    }
  }
  const tokef = g.tokef ?? c.test_date
  const passedThisCycle = !!(g.lastTest && tokef && g.lastTest >= addDaysISO(tokef, -120))
  if (passedThisCycle && !(p.test_passed ?? c.test_passed)) { p.test_passed = true; p.test_passed_date = g.lastTest }
  return p
}

export default function CarsClient() {
  const sb          = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantId    = useRef<string>('')
  const { showToast: toast } = useToast()
  const { confirm } = useConfirm()

  const [cars,     setCars]     = useState<Car[]>([])
  const [loading,       setLoading]       = useState(true)

  const [tab, setTab] = useState<'all' | 'inventory'>('inventory')
  const [invFilter, setInvFilter] = useState<string>('all')

  // Drive
  const [driveConnected,    setDriveConnected]    = useState(false)
  const [isAdmin,           setIsAdmin]           = useState(false)
  const [uploadingIdx,      setUploadingIdx]      = useState<number | null>(null)
  const [carDriveFiles,     setCarDriveFiles]     = useState<{id:string;name:string;mimeType:string;webViewLink?:string}[]>([])
  const [carDriveFolderId,  setCarDriveFolderId]  = useState<string | null>(null)
  const [carDriveLoading,   setCarDriveLoading]   = useState(false)
  const [carDriveUploading, setCarDriveUploading] = useState(false)
  const [showCarScanner,   setShowCarScanner]   = useState(false)
  const [carDrivePlate,    setCarDrivePlate]    = useState('')
  const [pendingDoc,       setPendingDoc]       = useState<File | null>(null)
  const [docName,          setDocName]          = useState('')
  const [photoLink,        setPhotoLink]        = useState('')
  const [docScan,          setDocScan]          = useState<{ done: number; total: number } | null>(null)
  const govSynced = useRef(false)

  // Car detail view + list filters
  const [viewCarId,  setViewCarId]  = useState<string | null>(null)
  // sale contract editor (opened from the car's actions / its contracts list)
  const [contractEd, setContractEd] = useState<{ carId: string; id: string | null } | null>(null)
  const [flagFilter, setFlagFilter] = useState<'all' | 'deposited' | 'no_refund' | 'no_test' | 'expiring'>('all')
  const [search,     setSearch]     = useState('')
  const isMobile = useIsMobile()

  // Car form
  const [carModal,   setCarModal]   = useState(false)
  const [editCarId,  setEditCarId]  = useState<string | null>(null)
  const [carForm,    setCarForm]    = useState({ ...emptyCarForm })
  const [photoUrls,  setPhotoUrls]  = useState<string[]>([''])
  const [carErrors,  setCarErrors]  = useState<Partial<Record<keyof typeof emptyCarForm, boolean>>>({})

  // Sell modal
  const [sellModal,     setSellModal]     = useState(false)
  const [sellTargetId,  setSellTargetId]  = useState<string | null>(null)
  const [sellForm,      setSellForm]      = useState({ date: todayISO(), price: '', buyer_name: '', buyer_phone: '', payment: 'העברה', notes: '' })

  // Interested buyer modal
  const [buyerModal,    setBuyerModal]    = useState(false)
  const [buyerTargetId, setBuyerTargetId] = useState<string | null>(null)
  const [buyerForm,     setBuyerForm]     = useState({ name: '', phone: '', offered_price: '', notes: '' })

  // Selected car

  // Decline modal (checking tab – לא קונה)
  const [declineModal,  setDeclineModal]  = useState(false)
  const [declineCarId,  setDeclineCarId]  = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineErr,    setDeclineErr]    = useState(false)

  // Lightbox
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null)

  // ── Load ──────────────────────────────────────────────────────────

  const load = useCallback(async (tid: string) => {
    const { data: c } = await sb.from('cars').select('*').eq('tenant_id', tid).order('created_at', { ascending: false })

    setCars((c || []).map(x => ({
      ...x,
      photos: Array.isArray(x.photos) ? x.photos : [],
      interested_buyers: Array.isArray(x.interested_buyers) ? x.interested_buyers : [],
      license_deposited: !!x.license_deposited,
      deposit_refund_requested: !!x.deposit_refund_requested,
      test_fee_paid: !!x.test_fee_paid,
      test_passed:   !!x.test_passed,
      doc_names:     Array.isArray(x.doc_names) ? x.doc_names : [],
    })))
    setLoading(false)
  }, [sb])

  useEffect(() => {
    if (!profile) return
    tenantId.current = profile.tenantId
    setIsAdmin(profile.isAdmin)
    if (profile.isAdmin) {
      fetch(`/api/drive/status?tenant_id=${profile.tenantId}`)
        .then(r => r.json()).then(d => setDriveConnected(d.connected)).catch(() => {})
    }
    load(profile.tenantId)
  }, [profile, load])

  // ── Print buy request ─────────────────────────────────────────────

  // ── Car CRUD ──────────────────────────────────────────────────────

  function openCarForm(car?: Car) {
    setCarErrors({})
    if (car) {
      setEditCarId(car.id)
      setCarForm({
        plate:      car.plate      || '',
        make:       car.make       || '',
        model:      car.model      || '',
        year:       car.year       ? String(car.year)      : '',
        color:      car.color      || '',
        km:         car.km         ? String(car.km)        : '',
        condition:  car.condition  || 'good',
        status:     car.status     || 'available',
        buy_price:  car.buy_price  ? String(car.buy_price) : '',
        ask_price:  car.ask_price  ? String(car.ask_price) : '',
        sell_price: car.sell_price ? String(car.sell_price): '',
        test_date:  car.test_date  || '',
        insur_date: car.insur_date || '',
        contact:    car.contact    || '',
        owner_name: car.owner_name || '',
        fuel_type:  car.fuel_type  || '',
        seats:      car.seats      ? String(car.seats)     : '',
        notes:           car.notes            || '',
        reserved_for:    car.reserved_for     || '',
        current_location: car.current_location || '',
        hand:               car.hand ? String(car.hand) : '',
        original_ownership: car.original_ownership || '',
        car_code:           car.car_code || '',
        test_fee_paid:      !!car.test_fee_paid,
        test_fee_paid_date: car.test_fee_paid_date || '',
        test_passed:        !!car.test_passed,
        test_passed_date:   car.test_passed_date || '',
        license_deposited:    !!car.license_deposited,
        license_deposit_date: car.license_deposit_date || '',
        deposit_refund_requested:      !!car.deposit_refund_requested,
        deposit_refund_requested_date: car.deposit_refund_requested_date || '',
      })
      setPhotoUrls([...car.photos])
      if (driveConnected) loadCarDriveFiles(car.plate || '')
      else { setCarDriveFiles([]); setCarDriveFolderId(null) }
    } else {
      setEditCarId(null)
      setCarForm({ ...emptyCarForm })
      setPhotoUrls([])
      setCarDriveFiles([])
      setCarDriveFolderId(null)
      setCarDrivePlate('')
      setPendingDoc(null)
    }
    setCarModal(true)
  }

  function handleApiData(data: Partial<VehicleData>) {
    setCarForm(f => ({
      ...f,
      plate:     data.plate     ? String(data.plate) : f.plate,
      make:      data.make      ? String(data.make)  : f.make,
      model:     data.model     ? String(data.model) : f.model,
      year:      data.year      ? String(data.year)  : f.year,
      color:     data.color     ? String(data.color) : f.color,
      fuel_type: data.fuel      ? String(data.fuel)  : f.fuel_type,
      seats:     data.seats     ? String(data.seats) : f.seats,
    }))
    if (data.plate && driveConnected) loadCarDriveFiles(String(data.plate))
  }

  async function uploadPhoto(idx: number, file: File) {
    setUploadingIdx(idx)
    const small = await shrinkForUpload(file)
    const fd = new FormData()
    fd.append('file', small)
    fd.append('tenant_id', tenantId.current)
    fd.append('sub_folder', 'רכבים')
    if (carForm.plate) fd.append('item_name', carForm.plate)
    try {
      const res  = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      if (res.status === 413) { toast('התמונה גדולה מדי להעלאה (מקסימום כ-4MB)', 'error'); return }
      const data = await res.json().catch(() => ({ error: `שגיאת שרת (${res.status})` }))
      if (data.id) {
        setPhotoUrls(p => p.map((u, i) => i === idx ? data.id : u))
        toast('התמונה הועלתה ✓', 'success')
      } else {
        toast(data.error || 'שגיאה בהעלאה', 'error')
      }
    } catch {
      toast('שגיאת רשת', 'error')
    } finally {
      setUploadingIdx(null)
    }
  }

  async function loadCarDriveFiles(plate: string) {
    setCarDrivePlate(plate)
    setPendingDoc(null)
    setDocName('')
    if (!plate) { setCarDriveFiles([]); setCarDriveFolderId(null); return }
    setCarDriveLoading(true)
    try {
      const res  = await fetch(`/api/drive/files?tenant_id=${tenantId.current}&sub_folder=${encodeURIComponent('רכבים')}&item_name=${encodeURIComponent(plate)}`)
      const data = await res.json()
      if (data.error === 'token_expired') {
        toast('חיבור Google Drive פג תוקף — יש להתחבר מחדש בהגדרות', 'error')
        setCarDriveFiles([]); setCarDriveFolderId(null); return
      }
      setCarDriveFiles(data.files || [])
      setCarDriveFolderId(data.folderId || null)
    } catch {
      setCarDriveFiles([])
      setCarDriveFolderId(null)
      toast('שגיאה בטעינת קבצי Drive', 'error')
    } finally {
      setCarDriveLoading(false)
    }
  }

  // Every car document is saved in Drive as "<plate> - <doc name>.<ext>" inside רכבים/<plate>/
  async function uploadCarDriveFile(file: File, name: string) {
    if (!carDriveFolderId) {
      toast('לא ניתן להעלות — יש להזין מספר לוחית רישוי לרכב תחילה', 'error')
      return
    }
    const docLabel = name.trim()
    if (!docLabel) { toast('יש להזין שם למסמך', 'error'); return }
    setCarDriveUploading(true)
    // Phone photos / scans are often over Vercel's ~4.5MB request limit → shrink first.
    const small = await shrinkForUpload(file)
    if (small.size > MAX_UPLOAD_BYTES) {
      setCarDriveUploading(false)
      toast(`הקובץ גדול מדי (${(small.size / 1048576).toFixed(1)}MB) — מקסימום כ-4MB. נסו לסרוק שוב באיכות נמוכה יותר`, 'error')
      return
    }
    const dot = small.name.lastIndexOf('.')
    const ext = dot > 0 ? small.name.slice(dot) : (small.type === 'application/pdf' ? '.pdf' : '')
    const named = new File([small], `${carDrivePlate} - ${docLabel}${ext}`, { type: small.type })
    const fd = new FormData()
    fd.append('file', named)
    fd.append('tenant_id', tenantId.current)
    fd.append('folder_id', carDriveFolderId)
    try {
      const res  = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      if (res.status === 413) { toast('הקובץ גדול מדי להעלאה (מקסימום כ-4MB)', 'error'); return }
      const data = await res.json().catch(() => ({ error: `שגיאת שרת (${res.status})` }))
      if (data.id) {
        setCarDriveFiles(f => [{ id: data.id, name: data.name, mimeType: named.type || '', webViewLink: data.webViewLink }, ...f])
        setPendingDoc(null)
        setDocName('')
        toast('המסמך נשמר ב-Drive ✓', 'success')
      } else {
        toast(data.error || 'שגיאה בהעלאה', 'error')
      }
    } catch {
      toast('שגיאת רשת', 'error')
    } finally {
      setCarDriveUploading(false)
    }
  }

  async function deleteCarDriveFile(fileId: string) {
    if (!await confirm({ msg: 'מחוק קובץ זה מד-Drive?' })) return
    try {
      await fetch('/api/drive/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId.current, file_id: fileId }),
      })
      setCarDriveFiles(f => f.filter(x => x.id !== fileId))
      toast('הקובץ נמחק', 'success')
    } catch {
      toast('שגיאה במחיקה', 'error')
    }
  }

  // ── Ministry of Transport test sync (once per page load) ──────────

  async function syncGovTests(list: Car[]) {
    const targets = list.filter(c => c.plate && !c.license_deposited && c.status !== 'sold' && c.status !== 'declined')
    if (!targets.length) return
    let gov: Record<string, { tokef: string | null; lastTest: string | null }>
    try {
      const res = await fetch('/api/public/plate/test-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plates: targets.map(c => c.plate) }),
      })
      if (!res.ok) return
      gov = await res.json()
    } catch { return }
    const updates = targets
      .map(c => ({ id: c.id, patch: gov[c.plate!.replace(/[-\s]/g, '')] ? govTestPatch(c, gov[c.plate!.replace(/[-\s]/g, '')]) : {} }))
      .filter(u => Object.keys(u.patch).length)
    if (!updates.length) return
    const results = await Promise.all(updates.map(u => sb.from('cars').update(u.patch).eq('id', u.id)))
    const ok = updates.filter((_, i) => !results[i].error)
    results.forEach(r => { if (r.error) console.error('gov test sync update failed', r.error) })
    if (!ok.length) return
    setCars(cs => cs.map(c => { const u = ok.find(x => x.id === c.id); return u ? { ...c, ...u.patch } : c }))
    const renewed = ok.filter(u => 'test_date' in u.patch).length
    toast(`🚦 עודכנו נתוני טסט ממשרד התחבורה ל-${ok.length} רכבים${renewed ? ` (${renewed} עם תוקף חדש)` : ''}`, 'success')
  }

  useEffect(() => {
    if (loading || govSynced.current) return
    govSynced.current = true
    syncGovTests(cars)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ── Document names on the card ────────────────────────────────────

  // Whenever a car's Drive folder is listed (detail view / edit form) or changed, keep cars.doc_names in sync.
  useEffect(() => {
    if (carDriveLoading || !carDriveFolderId) return
    const id = viewCarId ?? editCarId
    const car = id ? cars.find(c => c.id === id) : null
    if (!car || car.plate !== carDrivePlate) return
    const names = carDriveFiles.map(f => docLabel(f.name, carDrivePlate))
    if (sameList(names, car.doc_names)) return
    sb.from('cars').update({ doc_names: names }).eq('id', car.id).then(({ error }) => {
      if (error) { console.error('doc_names update failed', error); return }
      setCars(cs => cs.map(c => c.id === car.id ? { ...c, doc_names: names } : c))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carDriveFiles, carDriveLoading, carDriveFolderId])

  // New car / changed plate in the form: open that plate's Drive folder so documents can be added right away.
  useEffect(() => {
    if (!carModal || !isAdmin || !driveConnected) return
    const plate = carForm.plate.trim()
    if (plate.replace(/\D/g, '').length < 7 || plate === carDrivePlate) return
    const t = setTimeout(() => loadCarDriveFiles(plate), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carModal, carForm.plate, isAdmin, driveConnected])

  // One-off: read every car's Drive folder and record its document names.
  async function scanAllDocs() {
    const list = cars.filter(c => c.plate)
    if (!list.length) return
    setDocScan({ done: 0, total: list.length })
    let changed = 0, failed = 0, i = 0
    const worker = async () => {
      while (i < list.length) {
        const c = list[i++]
        try {
          const res  = await fetch(`/api/drive/files?tenant_id=${tenantId.current}&sub_folder=${encodeURIComponent('רכבים')}&item_name=${encodeURIComponent(c.plate!)}`)
          const data = await res.json()
          if (data.error) throw new Error(data.error)
          const names = ((data.files || []) as { name: string }[]).map(f => docLabel(f.name, c.plate!))
          if (!sameList(names, c.doc_names)) {
            const { error } = await sb.from('cars').update({ doc_names: names }).eq('id', c.id)
            if (error) throw error
            setCars(cs => cs.map(x => x.id === c.id ? { ...x, doc_names: names } : x))
            changed++
          }
        } catch { failed++ }
        setDocScan(d => d && { ...d, done: d.done + 1 })
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    setDocScan(null)
    toast(`סריקה הסתיימה — ${changed} רכבים עודכנו${failed ? `, ${failed} נכשלו` : ''}`, failed ? 'error' : 'success')
  }

  async function addPhotos(files: File[]) {
    const base = photoUrls.length
    setPhotoUrls(p => [...p, ...files.map(() => '')])
    for (let k = 0; k < files.length; k++) await uploadPhoto(base + k, files[k])
  }

  async function saveCar() {
    const errors: Partial<Record<keyof typeof emptyCarForm, boolean>> = {}
    if (!carForm.make.trim() && !carForm.plate.trim()) {
      errors.make  = true
      errors.plate = true
    }
    if (Object.keys(errors).length) {
      setCarErrors(errors)
      toast('יש להזין לפחות יצרן או מספר רכב', 'error')
      return
    }
    setCarErrors({})
    const photos = photoUrls.map(u => extractDriveId(u)).filter(Boolean)
    const payload = {
      tenant_id:  tenantId.current,
      plate:      carForm.plate     || null,
      make:       carForm.make      || null,
      model:      carForm.model     || null,
      year:       carForm.year      ? Number(carForm.year)      : null,
      color:      carForm.color     || null,
      km:         carForm.km        ? Number(carForm.km)        : null,
      condition:  carForm.condition,
      status:     carForm.status,
      buy_price:  carForm.buy_price  ? Number(carForm.buy_price)  : null,
      ask_price:  carForm.ask_price  ? Number(carForm.ask_price)  : null,
      sell_price: carForm.sell_price ? Number(carForm.sell_price) : null,
      test_date:  carForm.test_date  || null,
      insur_date: carForm.insur_date || null,
      contact:    carForm.contact    || null,
      owner_name: carForm.owner_name || null,
      fuel_type:  carForm.fuel_type  || null,
      seats:      carForm.seats      ? Number(carForm.seats) : null,
      photos,
      // Documents uploaded from this form (also before the car existed) — keep the card's list in sync.
      ...(carDriveFolderId && carDrivePlate && carDrivePlate === carForm.plate
        ? { doc_names: carDriveFiles.map(f => docLabel(f.name, carDrivePlate)) } : {}),
      notes:            carForm.notes            || null,
      reserved_for:     carForm.status === 'reserved' ? (carForm.reserved_for || null) : null,
      current_location: carForm.current_location || null,
      hand:                 carForm.hand ? Number(carForm.hand) : null,
      original_ownership:   carForm.original_ownership.trim() || null,
      car_code:             carForm.car_code.trim() || null,
      test_fee_paid:        carForm.test_fee_paid,
      test_fee_paid_date:   carForm.test_fee_paid ? (carForm.test_fee_paid_date || null) : null,
      test_passed:          carForm.test_passed,
      test_passed_date:     carForm.test_passed ? (carForm.test_passed_date || null) : null,
      license_deposited:    carForm.license_deposited,
      license_deposit_date: carForm.license_deposited ? (carForm.license_deposit_date || null) : null,
      deposit_refund_requested:      carForm.license_deposited && carForm.deposit_refund_requested,
      deposit_refund_requested_date: carForm.license_deposited && carForm.deposit_refund_requested ? (carForm.deposit_refund_requested_date || null) : null,
      updated_at:       new Date().toISOString(),
    }

    if (editCarId) {
      const { error } = await sb.from('cars').update(payload).eq('id', editCarId)
      if (error) { toast('שגיאה בעדכון', 'error'); return }
      toast('הרכב עודכן ✓', 'success')
    } else {
      const { error } = await sb.from('cars').insert(payload)
      if (error) { toast('שגיאה בשמירה', 'error'); return }
      toast('הרכב נוסף ✓', 'success')
    }
    setCarModal(false)
    load(tenantId.current)
  }

  async function deleteCar(id: string) {
    const ok = await confirm({ msg: 'למחוק את הרכב?', variant: 'danger' })
    if (!ok) return
    await sb.from('cars').delete().eq('id', id)
    toast('הרכב נמחק', 'success')
    load(tenantId.current)
  }

  async function changeCarStatus(id: string, status: string) {
    await sb.from('cars').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load(tenantId.current)
  }

  function openDeclineModal(id: string) {
    setDeclineCarId(id); setDeclineReason(''); setDeclineErr(false); setDeclineModal(true)
  }

  async function confirmDecline() {
    if (!declineReason.trim()) { setDeclineErr(true); return }
    const car = cars.find(c => c.id === declineCarId)
    if (!car) return
    const entry = `\n[${new Date().toLocaleDateString('he-IL')}] ❌ לא קנינו: ${declineReason.trim()}`
    const newNotes = (car.notes || '') + entry
    await sb.from('cars').update({ status: 'declined', notes: newNotes, updated_at: new Date().toISOString() }).eq('id', declineCarId!)
    setDeclineModal(false)
    toast('נשמר ✓', 'success')
    load(tenantId.current)
  }

  // ── Sell ──────────────────────────────────────────────────────────

  function openSellModal(id: string) {
    setSellTargetId(id)
    setSellForm({ date: todayISO(), price: '', buyer_name: '', buyer_phone: '', payment: 'העברה', notes: '' })
    setSellModal(true)
  }

  async function confirmSell() {
    if (!sellForm.price) { toast('יש להזין מחיר מכירה', 'error'); return }
    const car = cars.find(c => c.id === sellTargetId)
    if (!car) return
    await sb.from('cars').update({
      status:       'sold',
      sold_date:    sellForm.date || null,
      sold_price:   Number(sellForm.price),
      sell_price:   Number(sellForm.price),
      buyer_name:   sellForm.buyer_name  || null,
      buyer_phone:  sellForm.buyer_phone || null,
      buyer_payment:sellForm.payment     || null,
      notes:        sellForm.notes ? (car.notes ? car.notes + '\n' + sellForm.notes : sellForm.notes) : car.notes,
      updated_at:   new Date().toISOString(),
    }).eq('id', sellTargetId!)
    setSellModal(false)
    toast('המכירה נרשמה ✓', 'success')
    load(tenantId.current)
  }

  // ── Interested buyers ─────────────────────────────────────────────

  function openBuyerModal(id: string) {
    setBuyerTargetId(id)
    setBuyerForm({ name: '', phone: '', offered_price: '', notes: '' })
    setBuyerModal(true)
  }

  async function saveBuyer() {
    if (!buyerForm.name.trim()) { toast('יש להזין שם', 'error'); return }
    const car = cars.find(c => c.id === buyerTargetId)
    if (!car) return
    const buyers: InterestedBuyer[] = [
      ...car.interested_buyers,
      {
        id:            crypto.randomUUID(),
        name:          buyerForm.name,
        phone:         buyerForm.phone         || undefined,
        offered_price: buyerForm.offered_price ? Number(buyerForm.offered_price) : undefined,
        notes:         buyerForm.notes         || undefined,
        date:          todayISO(),
      },
    ]
    await sb.from('cars').update({ interested_buyers: buyers, updated_at: new Date().toISOString() }).eq('id', buyerTargetId!)
    setBuyerModal(false)
    toast('מתעניין נוסף ✓', 'success')
    load(tenantId.current)
  }

  async function removeBuyer(carId: string, buyerId: string) {
    const car = cars.find(c => c.id === carId)
    if (!car) return
    const buyers = car.interested_buyers.filter(b => b.id !== buyerId)
    await sb.from('cars').update({ interested_buyers: buyers, updated_at: new Date().toISOString() }).eq('id', carId)
    load(tenantId.current)
  }

  // ── Requests CRUD ─────────────────────────────────────────────────

  // ── Sale Requests CRUD ────────────────────────────────────────────

  // ── Stats ─────────────────────────────────────────────────────────

  const invCars     = cars.filter(c => c.status !== 'sold' && c.status !== 'checking' && c.status !== 'declined')
  const checkCars   = cars.filter(c => c.status === 'checking')
  const soldCars    = cars.filter(c => c.status === 'sold')
  const totalAsk    = invCars.filter(c => c.status === 'available').reduce((s, c) => s + (c.ask_price || 0), 0)
  const totalProfit = soldCars.reduce((s, c) => s + ((c.sold_price || 0) - (c.buy_price || 0)), 0)

  // ── Filtered lists ────────────────────────────────────────────────

  function daysUntil(d: string | null) {
    return d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null
  }
  function applyFlags(list: Car[]) {
    const q = search.trim().toLowerCase()
    return list.filter(c => {
      if (q && ![c.plate, c.make, c.model, c.owner_name, c.current_location].some(v => v?.toLowerCase().includes(q))) return false
      const t = daysUntil(c.test_date), ins = daysUntil(c.insur_date)
      if (flagFilter === 'deposited') return c.license_deposited
      if (flagFilter === 'no_refund') return c.license_deposited && !c.deposit_refund_requested
      if (flagFilter === 'no_test')   return !c.license_deposited && (t === null || t < 0)
      if (flagFilter === 'expiring')  return !c.license_deposited && ((t !== null && t >= 0 && t <= 30) || (ins !== null && ins <= 30))
      return true
    })
  }
  const byStatus   = (list: Car[]) => invFilter === 'all' ? list : list.filter(c => c.status === invFilter)
  // "הכל": everything incl. sold (greyed, at the end)
  const allCars    = applyFlags(byStatus([...invCars, ...checkCars, ...soldCars]))
  const displayInv = applyFlags(byStatus(invCars))
  const viewCar    = viewCarId ? cars.find(c => c.id === viewCarId) ?? null : null
  const CARD_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, calc(50% - 6px)), 1fr))', gap: 12 }
  const depositedCount = [...invCars, ...checkCars].filter(c => c.license_deposited).length
  const noRefundCount  = [...invCars, ...checkCars].filter(c => c.license_deposited && !c.deposit_refund_requested).length
  const noTestCount    = [...invCars, ...checkCars].filter(c => { const t = daysUntil(c.test_date); return !c.license_deposited && (t === null || t < 0) }).length

  function renderFlagBar() {
    const sel = (active: boolean): React.CSSProperties => ({
      padding: '5px 12px', borderRadius: 16, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      background: active ? 'var(--primary)' : '#fff', color: active ? '#fff' : 'var(--text-muted)',
      fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
    })
    const statuses = [{ v: 'all', l: 'כל הסטטוסים' }, { v: 'available', l: 'למכירה' }, { v: 'reserved', l: 'שמור' }, { v: 'business', l: 'בשימוש העסק' },
      ...(tab === 'all' ? [{ v: 'sold', l: 'נמכר' }] : [])]
    const flags = [
      { v: 'deposited', l: `בהפקדה (${depositedCount})` },
      { v: 'no_refund', l: `בהפקדה – לא הוגש החזר (${noRefundCount})` },
      { v: 'no_test',   l: `ללא טסט בתוקף (${noTestCount})` },
      { v: 'expiring',  l: 'טסט/ביטוח עד 30 יום' },
    ] as const
    return (
      <FilterBar storageKey="cars" search={search} onSearch={setSearch} placeholder="חיפוש לפי מספר רכב / יצרן / דגם"
        chips={[
          ...(invFilter !== 'all' ? [{ key: 's', label: statuses.find(x => x.v === invFilter)?.l ?? invFilter, onRemove: () => setInvFilter('all') }] : []),
          ...(flagFilter !== 'all' ? [{ key: 'f', label: flags.find(x => x.v === flagFilter)?.l ?? '', onRemove: () => setFlagFilter('all') }] : []),
        ]}
        onClearAll={() => { setSearch(''); setInvFilter('all'); setFlagFilter('all') }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {statuses.map(f => <button key={f.v} type="button" onClick={() => setInvFilter(f.v)} style={sel(invFilter === f.v)}>{f.l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {flags.map(f => <button key={f.v} type="button" onClick={() => setFlagFilter(flagFilter === f.v ? 'all' : f.v)} style={sel(flagFilter === f.v)}>{f.l}</button>)}
        </div>
      </FilterBar>
    )
  }

  // ── Render helpers ────────────────────────────────────────────────

  function contractPrefill(c: Car): ContractPrefill {
    const price = c.sold_price ?? c.ask_price
    return {
      car:   { plate: c.plate ?? '', model: [c.make, c.model].filter(Boolean).join(' '), year: c.year ? String(c.year) : '' },
      buyer: { name: c.buyer_name ?? '', phone: c.buyer_phone ?? '' },
      price: price ? price.toLocaleString('he-IL') : '',
    }
  }

  function getCarActions(car: Car): RowMenuAction[] {
    const contract: RowMenuAction = { key: 'contract', label: 'חוזה מכירה', icon: '📝', onClick: () => setContractEd({ carId: car.id, id: null }) }
    if (car.status === 'checking') return [
      { key: 'edit', label: 'ערוך', icon: '✏️', onClick: () => openCarForm(car) },
      { key: 'buy', label: 'קונה!', icon: '✅', onClick: () => changeCarStatus(car.id, 'available') },
      { key: 'decline', label: 'לא קונה', icon: '❌', onClick: () => openDeclineModal(car.id) },
      contract,
      { key: 'delete', label: 'מחק', icon: '🗑', danger: true, onClick: () => deleteCar(car.id) },
    ]
    if (car.status === 'sold') return [
      { key: 'edit', label: 'ערוך', icon: '✏️', onClick: () => openCarForm(car) },
      contract,
      { key: 'delete', label: 'מחק', icon: '🗑', danger: true, onClick: () => deleteCar(car.id) },
    ]
    return [
      { key: 'edit', label: 'ערוך', icon: '✏️', onClick: () => openCarForm(car) },
      { key: 'buyer', label: 'מתעניין', icon: '🟡', onClick: () => openBuyerModal(car.id) },
      { key: 'sell', label: 'מכור', icon: '✅', onClick: () => openSellModal(car.id) },
      contract,
      { key: 'delete', label: 'מחק', icon: '🗑', danger: true, onClick: () => deleteCar(car.id) },
    ]
  }

  const DOC_SUGGESTIONS = ['רישיון רכב', 'ביטוח חובה', 'ביטוח מקיף', 'טסט', 'אישור הפקדה', 'חשבונית קנייה', 'הסכם מכירה', 'ייפוי כוח']

  function renderCarDocs() {
    if (carDriveLoading) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '6px 0' }}>טוען...</div>
    if (!carDrivePlate) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>יש להזין מספר רכב כדי לשמור מסמכים</div>
    const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
    return (
      <>
        {carDriveFiles.length === 0 && !pendingDoc && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>אין עדיין מסמכים לרכב זה</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {carDriveFiles.map(f => {
            const mt = f.mimeType || ''
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: '#f8fafc', borderRadius: 7, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 16 }}>{mt.startsWith('image/') ? '🖼️' : mt === 'application/pdf' ? '📄' : '📎'}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>
                {f.webViewLink && (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', flexShrink: 0 }}>פתח</a>
                )}
                <button onClick={() => deleteCarDriveFile(f.id)} aria-label="מחק מסמך" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14, flexShrink: 0 }}>✕</button>
              </div>
            )
          })}
        </div>

        {pendingDoc ? (
          <div style={{ border: '1.5px solid var(--primary)', borderRadius: 10, padding: 10, background: 'var(--success-soft)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📎 {pendingDoc.name}</div>
            <label style={{ fontSize: 12, fontWeight: 700 }}>שם המסמך</label>
            <input
              autoFocus value={docName} onChange={e => setDocName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && docName.trim()) uploadCarDriveFile(pendingDoc, docName) }}
              placeholder="לדוגמה: רישיון רכב" style={{ ...inp(), marginTop: 4 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '8px 0' }}>
              {DOC_SUGGESTIONS.map(n => (
                <button key={n} onClick={() => setDocName(n)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: '1px solid var(--border)', background: docName === n ? 'var(--primary)' : '#fff', color: docName === n ? '#fff' : 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
              ))}
            </div>
            {docName.trim() && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                יישמר כ: <strong style={{ color: 'var(--text)' }}>{carDrivePlate} - {docName.trim()}</strong>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => uploadCarDriveFile(pendingDoc, docName)} disabled={!docName.trim() || carDriveUploading}>
                {carDriveUploading ? 'מעלה...' : 'שמור ב-Drive'}
              </Button>
              <button onClick={() => { setPendingDoc(null); setDocName('') }} disabled={carDriveUploading} style={btn}>ביטול</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            {isMobile && <button onClick={() => setShowCarScanner(true)} style={btn}>סרוק</button>}
            <label style={{ cursor: 'pointer' }}>
              <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingDoc(f); setDocName('') } e.target.value = '' }} />
              <span style={btn}>הוסף מסמך</span>
            </label>
          </div>
        )}
        {showCarScanner && (
          <DocumentScannerModal
            onComplete={file => { setShowCarScanner(false); setPendingDoc(file); setDocName('') }}
            onClose={() => setShowCarScanner(false)}
          />
        )}
      </>
    )
  }

  function openCarView(car: Car) {
    setViewCarId(car.id)
    if (driveConnected) loadCarDriveFiles(car.plate || '')
    else { setCarDriveFiles([]); setCarDriveFolderId(null); setCarDrivePlate(car.plate || '') }
  }

  // Fee + track test only matter while renewing: test expired, missing, or due within 60 days.
  function inTestRenewal(car: Car) {
    if (!car.test_date) return true
    return (new Date(car.test_date).getTime() - Date.now()) / 86400000 <= 60
  }

  function CarCard({ car }: { car: Car }) {
    const st    = STATUS_MAP[car.status]
    const thumb = car.photos[0] ? driveThumb(car.photos[0]) : null
    const test  = dateChipStyle(car.test_date)
    const insur = dateChipStyle(car.insur_date)
    const tag: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }

    return (
      <div
        role="button" tabIndex={0}
        onClick={() => openCarView(car)}
        onKeyDown={e => { if (e.key === 'Enter') openCarView(car) }}
        style={{
          background: '#fff', borderRadius: 10, height: '100%', cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,.08)',
          border: '1px solid var(--border)', borderTop: `3px solid ${st?.color || 'var(--border)'}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(car.status === 'sold' ? { opacity: 0.5, filter: 'grayscale(1)' } : {}),
        }}>
        {/* Photo strip */}
        <div style={{ height: 88, background: '#f1f5f9', position: 'relative', flexShrink: 0 }}>
          {thumb
            ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: '#cbd5e1' }}>🚗</div>
          }
          <span style={{ position: 'absolute', top: 6, right: 6, background: st?.color || '#64748b', color: '#fff', padding: '1px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 700 }}>
            {st?.label}
          </span>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(255,255,255,.85)', borderRadius: 8 }}>
            <RowActionsMenu actions={getCarActions(car)} variant="plain" />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[car.make, car.model].filter(Boolean).join(' ') || 'רכב ללא שם'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
            {car.plate && <span style={{ direction: 'ltr', fontWeight: 700, color: 'var(--text)', background: '#fef9c3', border: '1px solid #facc15', borderRadius: 4, padding: '0 5px' }}>{car.plate}</span>}
            {car.year && <span>{car.year}</span>}
            {car.hand != null && <span>יד {car.hand}</span>}
          </div>
          {car.ask_price ? <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--primary)' }}>{fmt(car.ask_price)}</div> : null}
          {/* Only what needs attention: a valid test/insurance or a plain document list adds no tag */}
          {car.status !== 'sold' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'auto', paddingTop: 3 }}>
            {car.license_deposited
              ? (car.deposit_refund_requested
                  ? <span style={{ ...tag, background: '#ffedd5', color: '#c2410c' }}>בהפקדה</span>
                  : <span style={{ ...tag, background: '#fee2e2', color: '#dc2626' }}>בהפקדה · לא הוגש החזר</span>)
              : !test
                ? <span style={{ ...tag, background: '#fee2e2', color: '#dc2626' }}>אין טסט</span>
                : test.label !== car.test_date && <span style={{ ...tag, background: test.bg, color: test.color }}>טסט {test.label}</span>
            }
            {!car.license_deposited && inTestRenewal(car) && (car.test_fee_paid && car.test_passed
              ? <span style={{ ...tag, background: '#eff6ff', color: 'var(--primary)' }}>לעדכן תוקף טסט</span>
              : <span style={{ ...tag, background: '#ffedd5', color: '#c2410c' }}>חסר: {[!car.test_fee_paid && 'אגרה', !car.test_passed && 'מבחן'].filter(Boolean).join(' + ')}</span>
            )}
            {!car.license_deposited && insur && insur.label !== car.insur_date && <span style={{ ...tag, background: insur.bg, color: insur.color }}>ביטוח {insur.label}</span>}
            {car.interested_buyers.length > 0 && <span style={{ ...tag, background: '#f1f5f9', color: 'var(--text-muted)' }}>👥 {car.interested_buyers.length}</span>}
            {car.doc_names.length > 0 && <span title={car.doc_names.join('\n')} style={{ ...tag, background: '#f1f5f9', color: 'var(--text-muted)' }}>📄 {car.doc_names.length}</span>}
          </div>
          )}
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-muted)' }}>
      טוען...
    </div>
  )

  // ── Excel / JSON ──────────────────────────────────────────────────

  function exportExcel() {
    const rows = cars.map(c => ({ לוחית: c.plate, יצרן: c.make ?? '', דגם: c.model ?? '', שנה: c.year ?? '', יד: c.hand ?? '', 'בעלות מקורית': c.original_ownership ?? '', 'קוד רכב': c.car_code ?? '', צבע: c.color ?? '', 'ק"מ': c.km ?? '', סטטוס: c.status ?? '', 'מחיר קנייה': c.buy_price ?? '', 'מחיר מבוקש': c.ask_price ?? '', 'מחיר מכירה': c.sell_price ?? '', הערות: c.notes ?? '' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'רכבים')
    XLSX.writeFile(wb, 'רכבים.xlsx')
  }

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v4h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
        iconBg="linear-gradient(135deg,#8b5cf6,#a78bfa)"
        iconShadow="#8b5cf644"
        title="ניהול רכבים"
        subtitle="מלאי, קנייה ומכירה"
        actions={<>
          <MoreMenu excel={{ onExport: exportExcel }} actions={isAdmin && driveConnected ? [
            { key: 'scan', label: docScan ? `סורק מסמכים ${docScan.done}/${docScan.total}…` : 'עדכון רשימת מסמכים מ-Drive', icon: '📂', onClick: () => { if (!docScan) scanAllDocs() } },
          ] : []} />
          <Button onClick={() => openCarForm()}>+ הוסף רכב</Button>
        </>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(130px, calc(50% - 6px)), 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="במלאי"        value={invCars.length}     />
        <StatCard label="למכירה"       value={invCars.filter(c=>c.status==='available').length} color="var(--primary)" />
        <StatCard label="שמורים"       value={invCars.filter(c=>c.status==='reserved').length}  color="#d97706" />
        <StatCard label="שווי מלאי"    value={fmt(totalAsk)}      color="var(--accent)" />
        <StatCard label="רווח כולל"    value={fmt(totalProfit)}   color={totalProfit >= 0 ? 'var(--primary)' : 'var(--danger)'} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
        {[
          { key: 'inventory', label: `במלאי (${invCars.length})` },
          { key: 'all',       label: `הכל (${invCars.length + checkCars.length + soldCars.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            transition: 'all .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: ALL ── */}
      {tab === 'all' && (
        <>
          {renderFlagBar()}
          {allCars.length === 0
            ? <Empty icon="🚗" text="אין רכבים בסינון זה" />
            : <div style={CARD_GRID}>
                {allCars.map(c => <div key={c.id}>{CarCard({ car: c })}</div>)}
              </div>
          }
        </>
      )}

      {/* ── TAB: INVENTORY ── */}
      {tab === 'inventory' && (
        <>
          {renderFlagBar()}
          {displayInv.length === 0
            ? <Empty icon="📦" text={invCars.length === 0 ? 'אין רכבים במלאי' : 'אין רכבים בסינון זה'} action={invCars.length === 0 ? 'הוסף רכב ראשון' : undefined} onAction={invCars.length === 0 ? () => openCarForm() : undefined} />
            : <div style={CARD_GRID}>
                {displayInv.map(c => <div key={c.id}>{CarCard({ car: c })}</div>)}
              </div>
          }
        </>
      )}


      {/* ── LIGHTBOX ── */}
      {/* ── Car detail view ── */}
      <Modal
        open={!!viewCar} onClose={() => setViewCarId(null)} maxWidth={760}
        title={viewCar ? ([viewCar.make, viewCar.model].filter(Boolean).join(' ') || 'רכב ללא שם') + (viewCar.plate ? ` · ${viewCar.plate}` : '') : ''}
      >
        {viewCar && (() => {
          const c     = viewCar
          const st    = STATUS_MAP[c.status]
          const cond  = CONDITIONS.find(x => x.value === c.condition)
          const test  = dateChipStyle(c.test_date)
          const insur = dateChipStyle(c.insur_date)
          const rows: [string, React.ReactNode][] = [
            ['מספר רכב', c.plate ? <span style={{ direction: 'ltr', display: 'inline-block' }}>{c.plate}</span> : null],
            ['שנה', c.year], ['יד', c.hand], ['בעלות מקורית', c.original_ownership], ['קוד רכב', c.car_code], ['צבע', c.color], ['ק"מ', fmtKm(c.km) || null],
            ['מצב', cond ? <span style={{ color: COND_COLOR[c.condition] }}>{cond.label}</span> : null], ['דלק', c.fuel_type], ['מושבים', c.seats],
            ['מחיר קנייה', c.buy_price ? fmt(c.buy_price) : null],
            ['מחיר מבוקש', c.ask_price ? fmt(c.ask_price) : null],
            ['מחיר מכירה', c.sold_price ? fmt(c.sold_price) : null],
            ['תוקף טסט', c.test_date ? <span style={{ color: test?.color, fontWeight: 700 }}>{c.test_date}{test && test.label !== c.test_date ? ` (${test.label})` : ''}</span> : null],
            ['תוקף ביטוח', c.insur_date ? <span style={{ color: insur?.color, fontWeight: 700 }}>{c.insur_date}{insur && insur.label !== c.insur_date ? ` (${insur.label})` : ''}</span> : null],
            ['אגרת טסט', c.license_deposited ? null : c.test_fee_paid
              ? <span style={{ color: '#166534' }}>✅ שולמה{c.test_fee_paid_date ? ` (${c.test_fee_paid_date})` : ''}</span>
              : <span style={{ color: '#dc2626' }}>לא שולמה</span>],
            ['מבחן אחרון (משרד התחבורה)', c.gov_last_test_date],
            ['מבחן במסלול', c.license_deposited ? null : c.test_passed
              ? <span style={{ color: '#166534' }}>✅ עבר{c.test_passed_date ? ` (${c.test_passed_date})` : ''}</span>
              : <span style={{ color: '#dc2626' }}>לא עבר</span>],
            ['הפקדת רישיון', c.license_deposited ? `🅿️ מופקד${c.license_deposit_date ? ' מ-' + c.license_deposit_date : ''}` : null],
            ['הוגשה בקשה להחזר?', !c.license_deposited ? null : c.deposit_refund_requested
              ? <span style={{ color: '#166534' }}>✅ כן{c.deposit_refund_requested_date ? ` (${c.deposit_refund_requested_date})` : ''}</span>
              : <span style={{ color: '#dc2626' }}>לא</span>],
            ['מיקום', c.current_location], ['בעלים', c.owner_name], ['איש קשר', c.contact],
            ['שמור עבור', c.status === 'reserved' ? c.reserved_for : null],
            ['קונה', c.buyer_name ? `${c.buyer_name}${c.buyer_phone ? ' · ' + c.buyer_phone : ''}` : null],
            ['תאריך מכירה', c.sold_date],
          ]
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status + actions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ background: st?.color || '#64748b', color: '#fff', padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{st?.label}</span>
                {c.license_deposited && <span style={{ background: '#ffedd5', color: '#c2410c', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>בהפקדה</span>}
                <div style={{ flex: 1 }} />
                {getCarActions(c).map(a => (
                  <button key={a.key} onClick={() => { setViewCarId(null); a.onClick() }} style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    border: `1.5px solid ${a.danger ? 'var(--danger)' : 'var(--border)'}`, background: '#fff',
                    color: a.danger ? 'var(--danger)' : 'var(--text)',
                  }}>{a.icon} {a.label}</button>
                ))}
              </div>

              {/* Photos */}
              {c.photos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                  {c.photos.map((ph, i) => (
                    <img key={i} src={driveThumb(ph)} alt="" onClick={() => setLightbox({ photos: c.photos, idx: i })}
                      style={{ width: 110, height: 76, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0, background: '#f1f5f9' }} />
                  ))}
                </div>
              )}

              {/* Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, 100%), 1fr))', gap: '8px 16px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>

              {c.notes && (
                <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>הערות</div>{c.notes}
                </div>
              )}

              {c.interested_buyers.length > 0 && (
                <div style={{ background: '#fef9c3', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>מתעניינים ({c.interested_buyers.length})</div>
                  {c.interested_buyers.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span><strong>{b.name}</strong>{b.phone ? ' · ' + b.phone : ''}{b.offered_price ? ` · 💰 ${fmt(b.offered_price)}` : ''}</span>
                      <button onClick={() => removeBuyer(c.id, b.id)} aria-label="הסר מתעניין" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b45309', fontSize: 13 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sale contracts */}
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>חוזי מכירה</div>
                <CarContractsPanel carId={c.id} onOpen={id => { setViewCarId(null); setContractEd({ carId: c.id, id }) }} />
              </div>

              {/* Documents */}
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>מסמכי רכב</div>
                {!isAdmin
                  ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>מסמכים זמינים למנהל בלבד</div>
                  : !driveConnected
                    ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>יש לחבר Google Drive בהגדרות כדי לשמור מסמכים</div>
                    : renderCarDocs()}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* back to the car's view when the contract closes */}
      <CarContractEditor
        open={!!contractEd} contractId={contractEd?.id ?? null} carId={contractEd?.carId ?? null}
        prefill={(() => { const car = contractEd && cars.find(x => x.id === contractEd.carId); return car ? contractPrefill(car) : undefined })()}
        onClose={() => { const cid = contractEd?.carId ?? null; setContractEd(null); setViewCarId(cid) }}
      />

      {lightbox && (
        <div
          onClick={e => e.target === e.currentTarget && setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 1100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 38, height: 38, fontSize: 20, cursor: 'pointer' }}>✕</button>
          <img src={driveThumb(lightbox.photos[lightbox.idx])} alt="" style={{ maxWidth: '92vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 10 }} />
          {lightbox.photos.length > 1 && (
            <div style={{ display: 'flex', gap: 20, marginTop: 14, alignItems: 'center' }}>
              <button onClick={() => setLightbox(l => l && { ...l, idx: (l.idx - 1 + l.photos.length) % l.photos.length })} style={lbBtn()}>‹</button>
              <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>{lightbox.idx + 1} / {lightbox.photos.length}</span>
              <button onClick={() => setLightbox(l => l && { ...l, idx: (l.idx + 1) % l.photos.length })} style={lbBtn()}>›</button>
            </div>
          )}
        </div>
      )}

      {/* ── CAR FORM MODAL ── */}
      <Modal open={carModal} onClose={() => setCarModal(false)} title={editCarId ? 'עריכת רכב' : 'הוסף רכב'} maxWidth={720}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>

          {/* Plate + API */}
          <Section title="🔍 שליפה אוטומטית מרישיון">
            <PlateInput module="cars" onFill={handleApiData} />
          </Section>

          {/* Basic fields */}
          <Section title="פרטי רכב">
            <Grid cols={2}>
              <Field label="יצרן" required error={carErrors.make}><input value={carForm.make} onChange={e => { setCarForm(f=>({...f,make:e.target.value})); setCarErrors(e=>({...e,make:false})) }} style={inp(carErrors.make)} /></Field>
              <Field label="דגם"><input value={carForm.model} onChange={e => setCarForm(f=>({...f,model:e.target.value}))} style={inp()} /></Field>
            </Grid>
            <Grid cols={4}>
              <Field label="לוחית" required error={carErrors.plate}><input inputMode="numeric" value={carForm.plate} onChange={e => { setCarForm(f=>({...f,plate:e.target.value})); setCarErrors(e=>({...e,plate:false})) }} style={{...inp(carErrors.plate),direction:'ltr'}} placeholder="12-345-67" /></Field>
              <Field label="שנה"><input type="number" value={carForm.year} onChange={e => setCarForm(f=>({...f,year:e.target.value}))} style={inp()} placeholder="2020" /></Field>
              <Field label="ק״מ"><input type="number" value={carForm.km} onChange={e => setCarForm(f=>({...f,km:e.target.value}))} style={inp()} /></Field>
              <Field label="צבע"><input value={carForm.color} onChange={e => setCarForm(f=>({...f,color:e.target.value}))} style={inp()} /></Field>
              <Field label="יד"><input type="number" value={carForm.hand} onChange={e => setCarForm(f=>({...f,hand:e.target.value}))} style={inp()} placeholder="1" min="0" max="20" /></Field>
              <Field label="בעלות מקורית">
                <input list="ownership-options" value={carForm.original_ownership} onChange={e => setCarForm(f=>({...f,original_ownership:e.target.value}))} style={inp()} placeholder="פרטי / ליסינג / השכרה..." />
                <datalist id="ownership-options">
                  {['פרטי', 'ליסינג', 'השכרה', 'חברה', 'מונית', 'לימוד נהיגה', 'ממשלתי', 'יבוא אישי'].map(o => <option key={o} value={o} />)}
                </datalist>
              </Field>
              <Field label="קוד רכב"><input value={carForm.car_code} onChange={e => setCarForm(f=>({...f,car_code:e.target.value}))} style={inp()} placeholder="אם יש" /></Field>
            </Grid>
            <Grid cols={3}>
              <Field label="סוג דלק"><input value={carForm.fuel_type} onChange={e => setCarForm(f=>({...f,fuel_type:e.target.value}))} style={inp()} /></Field>
              <Field label="מושבים"><input type="number" value={carForm.seats} onChange={e => setCarForm(f=>({...f,seats:e.target.value}))} style={inp()} /></Field>
              <Field label="מצב">
                <select value={carForm.condition} onChange={e => setCarForm(f=>({...f,condition:e.target.value}))} style={inp()}>
                  {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* Status + Prices */}
          <Section title="סטטוס ומחירים" accent>
            <Grid cols={3}>
              <Field label="סטטוס">
                <select value={carForm.status} onChange={e => setCarForm(f=>({...f,status:e.target.value}))} style={inp()}>
                  {STATUSES.filter(s => (s.value !== 'checking' && s.value !== 'declined') || s.value === carForm.status).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="💰 מחיר קנייה (₪)"><input type="number" value={carForm.buy_price} onChange={e => setCarForm(f=>({...f,buy_price:e.target.value}))} style={inp()} /></Field>
              <Field label="🏷️ מחיר מבוקש (₪)"><input type="number" value={carForm.ask_price} onChange={e => setCarForm(f=>({...f,ask_price:e.target.value}))} style={inp()} /></Field>
            </Grid>
            {carForm.status === 'reserved' && (
              <Field label="🟡 שמור עבור (שם / פרטים)">
                <input value={(carForm as any).reserved_for || ''} onChange={e => setCarForm(f=>({...f, reserved_for: e.target.value}))} style={inp()} placeholder="לדוגמה: אחמד 050-0000000" />
              </Field>
            )}
          </Section>

          {/* Dates */}
          <Section title="תאריכים">
            <Grid cols={2}>
              <Field label="תוקף טסט"><input type="date" value={carForm.test_date} onChange={e => {
                const v = e.target.value
                // New validity later than the saved one = test renewed → next year's fee/test start unchecked.
                const prev = editCarId ? cars.find(c => c.id === editCarId)?.test_date : null
                const renewed = !!(prev && v && v > prev)
                setCarForm(f => ({ ...f, test_date: v, ...(renewed ? { test_fee_paid: false, test_fee_paid_date: '', test_passed: false, test_passed_date: '' } : {}) }))
              }} style={inp()} /></Field>
              <Field label="תוקף ביטוח"><input type="date" value={carForm.insur_date} onChange={e => setCarForm(f=>({...f,insur_date:e.target.value}))} style={inp()} /></Field>
              <Field label="טסט – אגרה ומבחן">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={carForm.test_fee_paid} onChange={e => setCarForm(f=>({...f,test_fee_paid:e.target.checked, test_fee_paid_date: e.target.checked ? (f.test_fee_paid_date || todayISO()) : ''}))} />
                    💳 אגרה שולמה
                    {carForm.test_fee_paid && <input type="date" value={carForm.test_fee_paid_date} onChange={e => setCarForm(f=>({...f,test_fee_paid_date:e.target.value}))} style={{ ...inp(), width: 'auto', padding: '3px 6px', fontSize: 12 }} />}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={carForm.test_passed} onChange={e => setCarForm(f=>({...f,test_passed:e.target.checked, test_passed_date: e.target.checked ? (f.test_passed_date || todayISO()) : ''}))} />
                    ✅ עבר מבחן במסלול
                    {carForm.test_passed && <input type="date" value={carForm.test_passed_date} onChange={e => setCarForm(f=>({...f,test_passed_date:e.target.value}))} style={{ ...inp(), width: 'auto', padding: '3px 6px', fontSize: 12 }} />}
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>מתאפס אוטומטית כשמעדכנים תוקף טסט חדש</span>
                </div>
              </Field>
              <Field label="הפקדת רישיון (ירד מהכביש)">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 38 }}>
                  <input type="checkbox" checked={carForm.license_deposited} onChange={e => setCarForm(f=>({...f,license_deposited:e.target.checked}))} />
                  🅿️ הרישיון מופקד
                </label>
              </Field>
              {carForm.license_deposited && (
                <Field label="תאריך הפקדה"><input type="date" value={carForm.license_deposit_date} onChange={e => setCarForm(f=>({...f,license_deposit_date:e.target.value}))} style={inp()} /></Field>
              )}
              {carForm.license_deposited && (
                <Field label="האם הוגשה בקשה להחזר?">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 38 }}>
                    <input type="checkbox" checked={carForm.deposit_refund_requested} onChange={e => setCarForm(f=>({...f,deposit_refund_requested:e.target.checked}))} />
                    💸 כן, הוגשה בקשה להחזר
                  </label>
                </Field>
              )}
              {carForm.license_deposited && carForm.deposit_refund_requested && (
                <Field label="תאריך הגשת הבקשה"><input type="date" value={carForm.deposit_refund_requested_date} onChange={e => setCarForm(f=>({...f,deposit_refund_requested_date:e.target.value}))} style={inp()} /></Field>
              )}
            </Grid>
          </Section>

          {/* Contact */}
          <Section title="פרטים נוספים">
            <Grid cols={2}>
              <Field label="איש קשר / מוכר"><input value={carForm.contact} onChange={e => setCarForm(f=>({...f,contact:e.target.value}))} style={inp()} /></Field>
              <Field label="שם בעלים"><input value={carForm.owner_name} onChange={e => setCarForm(f=>({...f,owner_name:e.target.value}))} style={inp()} /></Field>
            </Grid>
            <Field label="📍 מיקום נוכחי / מי נוהג ברכב">
              <input value={carForm.current_location} onChange={e => setCarForm(f=>({...f,current_location:e.target.value}))} style={inp()} placeholder="לדוגמה: חניון ראשי / יוסי 050-0000000" />
            </Field>
            <Field label="הערות">
              <textarea value={carForm.notes} onChange={e => setCarForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} />
            </Field>
          </Section>

          {/* Photos */}
          {isAdmin && !driveConnected && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>⚠️ Drive לא מחובר — אי אפשר להעלות תמונות ומסמכים</span>
              <a href={`/api/drive/auth?tenant_id=${tenantId.current}`} style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>חבר עכשיו →</a>
            </div>
          )}

          {/* Photos | Documents — side by side, stacked on narrow screens */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
            <Section title="📷 תמונות">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {photoUrls.map((url, i) => url ? (
                  <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
                    <img src={driveThumb(url)} alt="" onClick={() => setLightbox({ photos: photoUrls.filter(Boolean), idx: photoUrls.filter(Boolean).indexOf(url) })}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: '#fff' }} />
                    <button onClick={() => setPhotoUrls(p => p.filter((_, j) => j !== i))} aria-label="הסר תמונה" style={{
                      position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, border: 'none',
                      background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '20px', padding: 0,
                    }}>✕</button>
                  </div>
                ) : uploadingIdx === i ? (
                  <div key={i} style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>⏳</div>
                ) : null)}
                {isAdmin && driveConnected && (
                  <label title="העלה תמונות" style={{ width: 64, height: 64, borderRadius: 8, border: '1.5px dashed var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fff', color: 'var(--primary)', fontSize: 11, fontWeight: 700 }}>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                      onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) addPhotos(fs); e.target.value = '' }} />
                    <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>הוסף
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={photoLink} onChange={e => setPhotoLink(e.target.value)} placeholder="או הדבק קישור Drive לתמונה"
                  style={{ ...inp(), flex: 1, direction: 'ltr', fontSize: 12, padding: '5px 8px' }} />
                <button disabled={!photoLink.trim()} onClick={() => { setPhotoUrls(p => [...p, photoLink.trim()]); setPhotoLink('') }}
                  style={{ fontSize: 12, padding: '5px 10px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>הוסף</button>
              </div>
            </Section>

            {isAdmin && driveConnected && (
              <Section title="📁 מסמכים">{renderCarDocs()}</Section>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setCarModal(false)}>ביטול</Button>
          <Button onClick={saveCar}>שמור</Button>
        </div>
      </Modal>

      {/* ── SELL MODAL ── */}
      <Modal open={sellModal} onClose={() => setSellModal(false)} title="✅ תיעוד מכירה" maxWidth={480}>
        {sellTargetId && (() => {
          const car = cars.find(c => c.id === sellTargetId)
          return car ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
                🚗 <strong>{car.make} {car.model}</strong>{car.year ? ` (${car.year})` : ''}
                {car.ask_price ? ` — מחיר מבוקש: ${fmt(car.ask_price)}` : ''}
              </div>
              {car.interested_buyers.length > 0 && (
                <Field label="בחר מתעניין (אופציונלי)">
                  <select
                    style={inp()}
                    onChange={e => {
                      const b = car.interested_buyers.find(b => b.id === e.target.value)
                      if (b) setSellForm(f => ({ ...f, buyer_name: b.name, buyer_phone: b.phone || '', price: b.offered_price ? String(b.offered_price) : f.price }))
                    }}
                    defaultValue=""
                  >
                    <option value="">— הזנה ידנית —</option>
                    {car.interested_buyers.map(b => (
                      <option key={b.id} value={b.id}>{b.name}{b.phone ? ` · ${b.phone}` : ''}{b.offered_price ? ` · הציע ${fmt(b.offered_price)}` : ''}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Grid cols={2}>
                <Field label="תאריך מכירה"><input type="date" value={sellForm.date} onChange={e => setSellForm(f=>({...f,date:e.target.value}))} style={inp()} /></Field>
                <Field label="מחיר מכירה (₪) *"><input type="number" value={sellForm.price} onChange={e => setSellForm(f=>({...f,price:e.target.value}))} style={inp()} autoFocus /></Field>
              </Grid>
              <Grid cols={2}>
                <Field label="נמכר ל- (שם)"><input value={sellForm.buyer_name} onChange={e => setSellForm(f=>({...f,buyer_name:e.target.value}))} style={inp()} /></Field>
                <Field label="טלפון קונה"><input type="tel" value={sellForm.buyer_phone} onChange={e => setSellForm(f=>({...f,buyer_phone:e.target.value}))} style={inp()} /></Field>
              </Grid>
              <Field label="אמצעי תשלום">
                <select value={sellForm.payment} onChange={e => setSellForm(f=>({...f,payment:e.target.value}))} style={inp()}>
                  {PAYMENT_METHODS.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="הערות"><textarea value={sellForm.notes} onChange={e => setSellForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} /></Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="secondary" onClick={() => setSellModal(false)}>ביטול</Button>
                <Button variant="success" onClick={confirmSell}>אשר מכירה</Button>
              </div>
            </div>
          ) : null
        })()}
      </Modal>

      {/* ── INTERESTED BUYER MODAL ── */}
      {/* ── Decline modal ── */}
      <Modal open={declineModal} onClose={() => setDeclineModal(false)} title="❌ לא קונים – סיבה" maxWidth={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>הסיבה תישמר בהיסטוריה של הרכב לשימוש עתידי.</div>
          <Field label="סיבה (חובה)">
            <textarea
              value={declineReason}
              onChange={e => { setDeclineReason(e.target.value); setDeclineErr(false) }}
              rows={3}
              autoFocus
              placeholder="לדוגמה: נראה אחרי תאונה, מחיר גבוה מדי..."
              style={{ ...inp(declineErr), resize: 'vertical' }}
            />
          </Field>
          {declineErr && <span style={{ fontSize: 12, color: 'var(--danger)' }}>יש למלא סיבה</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setDeclineModal(false)}>ביטול</Button>
            <Button variant="danger" onClick={confirmDecline}>לא קונים</Button>
          </div>
        </div>
      </Modal>

      <Modal open={buyerModal} onClose={() => setBuyerModal(false)} title="🟡 הוסף מתעניין" maxWidth={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Grid cols={2}>
            <Field label="שם מתעניין *"><input value={buyerForm.name} onChange={e => setBuyerForm(f=>({...f,name:e.target.value}))} style={inp()} autoFocus /></Field>
            <Field label="טלפון"><input type="tel" value={buyerForm.phone} onChange={e => setBuyerForm(f=>({...f,phone:e.target.value}))} style={inp()} /></Field>
          </Grid>
          <Field label="מחיר מוצע (₪)"><input type="number" value={buyerForm.offered_price} onChange={e => setBuyerForm(f=>({...f,offered_price:e.target.value}))} style={inp()} /></Field>
          <Field label="הערות"><textarea value={buyerForm.notes} onChange={e => setBuyerForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setBuyerModal(false)}>ביטול</Button>
            <Button onClick={saveBuyer}>שמור</Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}

// ── Mini UI helpers ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.07)', minWidth: 110 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

function Empty({ icon, text, action, onAction }: { icon: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <p style={{ margin: '0 0 16px' }}>{text}</p>
      {action && <Button onClick={onAction}>{action}</Button>}
    </div>
  )
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ background: accent ? '#f0fdf4' : '#f8fafc', border: `1px solid ${accent ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: accent ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>{children}</div>
}

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: error ? '#dc2626' : 'var(--text-muted)' }}>
        {label}{required && <span style={{ color: '#dc2626', marginRight: 2 }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 11, color: '#dc2626' }}>שדה חובה</span>}
    </div>
  )
}

function inp(err?: boolean): React.CSSProperties {
  return { width: '100%', padding: '8px 10px', border: `1.5px solid ${err ? '#dc2626' : 'var(--border)'}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: err ? '#fff5f5' : '#fff' }
}
function lbBtn(): React.CSSProperties {
  return { background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }
}
