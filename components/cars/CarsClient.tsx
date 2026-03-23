'use client'

import { useCallback, useEffect, useRef, useState, useId } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import PlateInput from '@/components/ui/PlateInput'
import ExcelMenu from '@/components/ui/ExcelMenu'
import { VehicleData } from '@/lib/utils/plateApi'

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
  notes: string | null
  created_at: string
}

interface CarRequest {
  id: string
  tenant_id: string
  name: string
  phone: string | null
  budget: number | null
  min_year: number | null
  max_km: number | null
  seats: string | null
  car_type: string | null
  fuel: string | null
  make_pref: string | null
  status: string        // open | handled | closed
  notes: string | null
  created_at: string
}

interface CarSaleRequest {
  id: string
  tenant_id: string
  name: string
  phone: string | null
  make: string | null
  model: string | null
  year: number | null
  plate: string | null
  car_code: string | null
  key_hanger: string | null
  km: number | null
  hand: number | null
  ownership_type: string | null
  list_price: number | null
  commission: number | null
  commission_type: 'fixed' | 'percent'
  wait_until: string | null
  status: string
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
  'new': '#166534', 'like-new': '#0369a1', 'good': '#1a9e5c', 'fair': '#b45309', 'poor': '#dc2626',
}

const STATUSES = [
  { value: 'checking',  label: '🔍 בדיקה',         color: '#0369a1' },
  { value: 'available', label: '🟢 למכירה',         color: '#1a9e5c' },
  { value: 'reserved',  label: '🟡 שמור',           color: '#d97706' },
  { value: 'business',  label: '🟣 בשימוש העסק',     color: '#7c3aed' },
  { value: 'sold',      label: '⚫ נמכר',           color: '#64748b' },
  { value: 'declined',  label: '❌ נדחה',           color: '#dc2626' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]))

const REQ_STATUSES = [
  { value: 'open',    label: 'פתוח',  color: '#1a9e5c' },
  { value: 'handled', label: 'טופל',  color: '#d97706' },
  { value: 'closed',  label: 'נסגר',  color: '#64748b' },
]
const REQ_STATUS_MAP = Object.fromEntries(REQ_STATUSES.map(s => [s.value, s]))

const PAYMENT_METHODS = ['העברה', 'מזומן', "צ'ק", 'אשראי', 'מימון']

const emptyCarForm = {
  plate: '', make: '', model: '', year: '', color: '',
  km: '', condition: 'good', status: 'available',
  buy_price: '', ask_price: '', sell_price: '',
  test_date: '', insur_date: '',
  contact: '', owner_name: '',
  fuel_type: '', seats: '',
  reserved_for: '',
  notes: '',
}

const emptyReqForm = {
  name: '', phone: '', budget: '', min_year: '',
  max_km: '', seats: '', car_type: '', fuel: '',
  make_pref: '', status: 'open', notes: '',
}

const emptySaleReqForm = {
  name: '', phone: '', make: '', model: '', year: '', plate: '',
  car_code: '', key_hanger: '', km: '', hand: '', ownership_type: '',
  list_price: '', commission: '',
  commission_type: 'fixed' as 'fixed' | 'percent',
  wait_until: '', status: 'open', notes: '',
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
  return { bg: '#dcfce7', color: '#166534', label: dateStr }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CarsClient() {
  const sb          = useRef(createClient()).current
  const tenantId    = useRef<string>('')
  const { showToast: toast } = useToast()
  const { confirm } = useConfirm()

  const [cars,     setCars]     = useState<Car[]>([])
  const [requests,      setRequests]      = useState<CarRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [updatingReqId, setUpdatingReqId] = useState<string | null>(null)

  const [tab, setTab] = useState<'inventory' | 'checking' | 'sold' | 'requests'>('inventory')
  const [invFilter, setInvFilter] = useState<string>('all')
  const [reqFilter,    setReqFilter]    = useState<string>('all')
  const [reqSubTab,    setReqSubTab]    = useState<'buy' | 'sell'>('buy')

  // Drive
  const [driveConnected,    setDriveConnected]    = useState(false)
  const [isAdmin,           setIsAdmin]           = useState(false)
  const [uploadingIdx,      setUploadingIdx]      = useState<number | null>(null)
  const [carDriveFiles,     setCarDriveFiles]     = useState<{id:string;name:string;mimeType:string;webViewLink?:string}[]>([])
  const [carDriveFolderId,  setCarDriveFolderId]  = useState<string | null>(null)
  const [carDriveLoading,   setCarDriveLoading]   = useState(false)
  const [carDriveUploading, setCarDriveUploading] = useState(false)

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

  // Kebab menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos,    setMenuPos]    = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Decline modal (checking tab – לא קונה)
  const [declineModal,  setDeclineModal]  = useState(false)
  const [declineCarId,  setDeclineCarId]  = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineErr,    setDeclineErr]    = useState(false)

  // Lightbox
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null)

  // Request form
  const [reqModal,      setReqModal]      = useState(false)
  const [editReqId,     setEditReqId]     = useState<string | null>(null)
  const [reqForm,       setReqForm]       = useState({ ...emptyReqForm })

  // Sale requests
  const [saleRequests,  setSaleRequests]  = useState<CarSaleRequest[]>([])
  const [saleReqModal,  setSaleReqModal]  = useState(false)
  const [editSaleReqId, setEditSaleReqId] = useState<string | null>(null)
  const [saleReqForm,   setSaleReqForm]   = useState({ ...emptySaleReqForm })

  // ── Load ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: prof } = await sb.from('profiles').select('tenant_id, role').eq('id', user.id).maybeSingle()
    if (!prof) { setLoading(false); return }
    tenantId.current = prof.tenant_id
    const admin = prof.role === 'admin' || prof.role === 'super_admin'
    setIsAdmin(admin)
    if (admin) {
      fetch(`/api/drive/status?tenant_id=${prof.tenant_id}`)
        .then(r => r.json()).then(d => setDriveConnected(d.connected)).catch(() => {})
    }

    const [{ data: c }, { data: r }, { data: sr }] = await Promise.all([
      sb.from('cars').select('*').eq('tenant_id', prof.tenant_id).order('created_at', { ascending: false }),
      sb.from('car_requests').select('*').eq('tenant_id', prof.tenant_id).order('created_at', { ascending: false }),
      sb.from('car_sale_requests').select('*').eq('tenant_id', prof.tenant_id).order('created_at', { ascending: false }),
    ])

    setCars((c || []).map(x => ({
      ...x,
      photos: Array.isArray(x.photos) ? x.photos : [],
      interested_buyers: Array.isArray(x.interested_buyers) ? x.interested_buyers : [],
    })))
    setRequests(r || [])
    setSaleRequests(sr || [])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])


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
        notes:        car.notes      || '',
        reserved_for: (car as any).reserved_for || '',
      })
      setPhotoUrls(car.photos.length ? [...car.photos] : [''])
      if (driveConnected) loadCarDriveFiles(car.plate || '')
      else { setCarDriveFiles([]); setCarDriveFolderId(null) }
    } else {
      setEditCarId(null)
      setCarForm({ ...emptyCarForm })
      setPhotoUrls([''])
      setCarDriveFiles([])
      setCarDriveFolderId(null)
    }
    setCarModal(true)
  }

  function handleApiData(data: Partial<VehicleData>) {
    setCarForm(f => ({
      ...f,
      make:      data.make      ? String(data.make)  : f.make,
      model:     data.model     ? String(data.model) : f.model,
      year:      data.year      ? String(data.year)  : f.year,
      color:     data.color     ? String(data.color) : f.color,
      fuel_type: data.fuel      ? String(data.fuel)  : f.fuel_type,
      seats:     data.seats     ? String(data.seats) : f.seats,
    }))
  }

  function handleSaleReqApiData(data: Partial<VehicleData>) {
    setSaleReqForm(f => ({
      ...f,
      plate:          data.plate          ? String(data.plate)          : f.plate,
      make:           data.make           ? String(data.make)           : f.make,
      model:          data.model          ? String(data.model)          : f.model,
      year:           data.year           ? String(data.year)           : f.year,
      ownership_type: data.ownership      ? String(data.ownership)      : f.ownership_type,
    }))
  }

  async function uploadPhoto(idx: number, file: File) {
    setUploadingIdx(idx)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tenant_id', tenantId.current)
    fd.append('sub_folder', 'רכבים')
    if (carForm.plate) fd.append('item_name', carForm.plate)
    try {
      const res  = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      const data = await res.json()
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
    if (!plate) { setCarDriveFiles([]); setCarDriveFolderId(null); return }
    setCarDriveLoading(true)
    try {
      const res  = await fetch(`/api/drive/files?tenant_id=${tenantId.current}&sub_folder=${encodeURIComponent('רכבים')}&item_name=${encodeURIComponent(plate)}`)
      const data = await res.json()
      setCarDriveFiles(data.files || [])
      setCarDriveFolderId(data.folderId || null)
    } catch {
      setCarDriveFiles([])
    } finally {
      setCarDriveLoading(false)
    }
  }

  async function uploadCarDriveFile(file: File) {
    if (!carDriveFolderId) return
    setCarDriveUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tenant_id', tenantId.current)
    fd.append('folder_id', carDriveFolderId)
    try {
      const res  = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.id) {
        setCarDriveFiles(f => [{ id: data.id, name: data.name, mimeType: data.mimeType, webViewLink: data.webViewLink }, ...f])
        toast('הקובץ הועלה ✓', 'success')
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
      notes:        carForm.notes || null,
      reserved_for: carForm.status === 'reserved' ? ((carForm as any).reserved_for || null) : null,
      updated_at:   new Date().toISOString(),
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
    load()
  }

  async function deleteCar(id: string) {
    const ok = await confirm({ msg: 'למחוק את הרכב?', variant: 'danger' })
    if (!ok) return
    await sb.from('cars').delete().eq('id', id)
    toast('הרכב נמחק', 'success')
    load()
  }

  async function changeCarStatus(id: string, status: string) {
    await sb.from('cars').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load()
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
    load()
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
    load()
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
    load()
  }

  async function removeBuyer(carId: string, buyerId: string) {
    const car = cars.find(c => c.id === carId)
    if (!car) return
    const buyers = car.interested_buyers.filter(b => b.id !== buyerId)
    await sb.from('cars').update({ interested_buyers: buyers, updated_at: new Date().toISOString() }).eq('id', carId)
    load()
  }

  // ── Requests CRUD ─────────────────────────────────────────────────

  function openReqForm(req?: CarRequest) {
    if (req) {
      setEditReqId(req.id)
      setReqForm({
        name:      req.name           || '',
        phone:     req.phone          || '',
        budget:    req.budget         ? String(req.budget)   : '',
        min_year:  req.min_year       ? String(req.min_year) : '',
        max_km:    req.max_km         ? String(req.max_km)   : '',
        seats:     req.seats          || '',
        car_type:  req.car_type       || '',
        fuel:      req.fuel           || '',
        make_pref: req.make_pref      || '',
        status:    req.status         || 'open',
        notes:     req.notes          || '',
      })
    } else {
      setEditReqId(null)
      setReqForm({ ...emptyReqForm })
    }
    setReqModal(true)
  }

  async function saveReq() {
    if (!reqForm.name.trim()) { toast('יש להזין שם לקוח', 'error'); return }
    const payload = {
      tenant_id: tenantId.current,
      name:      reqForm.name,
      phone:     reqForm.phone     || null,
      budget:    reqForm.budget    ? Number(reqForm.budget)   : null,
      min_year:  reqForm.min_year  ? Number(reqForm.min_year) : null,
      max_km:    reqForm.max_km    ? Number(reqForm.max_km)   : null,
      seats:     reqForm.seats     || null,
      car_type:  reqForm.car_type  || null,
      fuel:      reqForm.fuel      || null,
      make_pref: reqForm.make_pref || null,
      status:    reqForm.status,
      notes:     reqForm.notes     || null,
    }
    if (editReqId) {
      await sb.from('car_requests').update(payload).eq('id', editReqId)
      toast('הבקשה עודכנה ✓', 'success')
    } else {
      await sb.from('car_requests').insert(payload)
      toast('הבקשה נשמרה ✓', 'success')
    }
    setReqModal(false)
    load()
  }

  async function deleteReq(id: string) {
    const ok = await confirm({ msg: 'למחוק את הבקשה?', variant: 'danger' })
    if (!ok) return
    await sb.from('car_requests').delete().eq('id', id)
    toast('הבקשה נמחקה', 'success')
    load()
  }

  async function changeReqStatus(id: string, status: string) {
    // optimistic update
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    setUpdatingReqId(id)
    await sb.from('car_requests').update({ status }).eq('id', id)
    setUpdatingReqId(null)
  }

  // ── Sale Requests CRUD ────────────────────────────────────────────

  function openSaleReqForm(req?: CarSaleRequest) {
    if (req) {
      setEditSaleReqId(req.id)
      setSaleReqForm({
        name:            req.name            || '',
        phone:           req.phone           || '',
        make:            req.make            || '',
        model:           req.model           || '',
        year:            req.year            ? String(req.year) : '',
        plate:           req.plate           || '',
        car_code:        req.car_code        || '',
        key_hanger:      req.key_hanger      || '',
        km:              req.km              ? String(req.km)              : '',
        hand:            req.hand            ? String(req.hand)            : '',
        ownership_type:  req.ownership_type  || '',
        list_price:      req.list_price      ? String(req.list_price) : '',
        commission:      req.commission      ? String(req.commission) : '',
        commission_type: req.commission_type || 'fixed',
        wait_until:      req.wait_until      || '',
        status:          req.status          || 'open',
        notes:           req.notes           || '',
      })
    } else {
      setEditSaleReqId(null)
      setSaleReqForm({ ...emptySaleReqForm })
    }
    setSaleReqModal(true)
  }

  async function saveSaleReq() {
    if (!saleReqForm.name.trim()) { toast('יש להזין שם לקוח', 'error'); return }
    const payload = {
      tenant_id:       tenantId.current,
      name:            saleReqForm.name,
      phone:           saleReqForm.phone       || null,
      make:            saleReqForm.make        || null,
      model:           saleReqForm.model       || null,
      year:            saleReqForm.year        ? Number(saleReqForm.year)       : null,
      plate:           saleReqForm.plate       || null,
      car_code:        saleReqForm.car_code       || null,
      key_hanger:      saleReqForm.key_hanger     || null,
      km:              saleReqForm.km             ? Number(saleReqForm.km)   : null,
      hand:            saleReqForm.hand           ? Number(saleReqForm.hand) : null,
      ownership_type:  saleReqForm.ownership_type || null,
      list_price:      saleReqForm.list_price     ? Number(saleReqForm.list_price) : null,
      commission:      saleReqForm.commission  ? Number(saleReqForm.commission) : null,
      commission_type: saleReqForm.commission_type,
      wait_until:      saleReqForm.wait_until  || null,
      status:          saleReqForm.status,
      notes:           saleReqForm.notes       || null,
      updated_at:      new Date().toISOString(),
    }
    if (editSaleReqId) {
      await sb.from('car_sale_requests').update(payload).eq('id', editSaleReqId)
      toast('הבקשה עודכנה ✓', 'success')
    } else {
      await sb.from('car_sale_requests').insert(payload)
      toast('הבקשה נשמרה ✓', 'success')
    }
    setSaleReqModal(false)
    load()
  }

  async function deleteSaleReq(id: string) {
    const ok = await confirm({ msg: 'למחוק את הבקשה?', variant: 'danger' })
    if (!ok) return
    await sb.from('car_sale_requests').delete().eq('id', id)
    toast('הבקשה נמחקה', 'success')
    load()
  }

  async function changeSaleReqStatus(id: string, status: string) {
    setSaleRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    setUpdatingReqId(id)
    await sb.from('car_sale_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setUpdatingReqId(null)
  }

  // ── Stats ─────────────────────────────────────────────────────────

  const invCars     = cars.filter(c => c.status !== 'sold' && c.status !== 'checking' && c.status !== 'declined')
  const checkCars   = cars.filter(c => c.status === 'checking')
  const declinedCars = cars.filter(c => c.status === 'declined')
  const soldCars    = cars.filter(c => c.status === 'sold')
  const openReqs    = requests.filter(r => r.status === 'open')
  const totalAsk    = invCars.filter(c => c.status === 'available').reduce((s, c) => s + (c.ask_price || 0), 0)
  const totalProfit = soldCars.reduce((s, c) => s + ((c.sold_price || 0) - (c.buy_price || 0)), 0)

  // ── Filtered lists ────────────────────────────────────────────────

  const displayInv = invFilter === 'all' ? invCars : invCars.filter(c => c.status === invFilter)

  // ── Render helpers ────────────────────────────────────────────────

  function CarCard({ car }: { car: Car }) {
    const st    = STATUS_MAP[car.status]
    const cond  = CONDITIONS.find(c => c.value === car.condition)
    const thumb = car.photos[0] ? driveThumb(car.photos[0]) : null
    const test  = dateChipStyle(car.test_date)
    const insur = dateChipStyle(car.insur_date)

    return (
      <div style={{
        background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)',
        border: `2px solid ${st?.color || 'var(--border)'}`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Photo */}
        <div
          onClick={() => car.photos.length && setLightbox({ photos: car.photos, idx: 0 })}
          style={{
            height: 180, background: '#f1f5f9', position: 'relative',
            cursor: car.photos.length ? 'pointer' : 'default', overflow: 'hidden',
            borderTopLeftRadius: 10, borderTopRightRadius: 10,
          }}
        >
          {thumb
            ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: '#cbd5e1' }}>🚗</div>
          }
          {car.photos.length > 1 && (
            <span style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              📷 {car.photos.length}
            </span>
          )}
          <span style={{ position: 'absolute', top: 8, right: 8, background: st?.color || '#64748b', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
            {st?.label}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {[car.make, car.model].filter(Boolean).join(' ') || 'רכב ללא שם'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {[car.year, car.plate, car.color].filter(Boolean).join(' • ')}
          </div>
          {car.status === 'reserved' && (car as any).reserved_for && (
            <div style={{ fontSize: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 7, padding: '4px 9px', color: '#92400e', fontWeight: 600 }}>
              🟡 שמור עבור: {(car as any).reserved_for}
            </div>
          )}
          {car.ask_price && (
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>{fmt(car.ask_price)}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
            {car.km     && <Chip>{fmtKm(car.km)}</Chip>}
            {cond       && <Chip color={COND_COLOR[car.condition]}>{cond.label}</Chip>}
            {car.fuel_type && <Chip>{car.fuel_type}</Chip>}
            {car.seats  && <Chip>🪑 {car.seats}</Chip>}
            {car.buy_price && <Chip muted>קנייה: {fmt(car.buy_price)}</Chip>}
          </div>

          {(test || insur) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {test  && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: test.bg,  color: test.color  }}>🔧 טסט: {test.label}</span>}
              {insur && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: insur.bg, color: insur.color }}>🛡️ ביטוח: {insur.label}</span>}
            </div>
          )}

          {car.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{car.notes}</div>}

          {/* Interested buyers */}
          {car.interested_buyers.length > 0 && (
            <div style={{ background: '#fef9c3', borderRadius: 8, padding: '7px 10px', fontSize: 11, marginTop: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🟡 מתעניינים ({car.interested_buyers.length}):</div>
              {car.interested_buyers.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                  <div style={{ lineHeight: 1.5 }}>
                    <strong>{b.name}</strong>{b.phone ? ' · ' + b.phone : ''}
                    {b.offered_price ? <><br />💰 הציע: {fmt(b.offered_price)}</> : ''}
                  </div>
                  <button onClick={() => removeBuyer(car.id, b.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b45309', fontSize: 13, padding: '0 4px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kebab menu */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px 10px' }}>
          <button
            onClick={e => {
              e.stopPropagation()
              if (openMenuId === car.id) { setOpenMenuId(null); return }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenuPos({ x: rect.left, y: rect.top })
              setOpenMenuId(car.id)
            }}
            style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, fontWeight: 900, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 1 }}
            title="פעולות"
          >⋮</button>

          {openMenuId === car.id && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              onMouseDown={() => setOpenMenuId(null)}
            >
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{ position: 'fixed', bottom: window.innerHeight - menuPos.y + 4, left: menuPos.x, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.15)', zIndex: 50, minWidth: 180, overflow: 'hidden' }}
              >
                <MenuItem icon="✏️" label="עריכה"          onClick={() => { setOpenMenuId(null); openCarForm(car) }} />
                {car.status !== 'sold' && <>
                  <MenuItem icon="🟡" label="הוסף מתעניין" onClick={() => { setOpenMenuId(null); openBuyerModal(car.id) }} />
                  <MenuItem icon="✅" label="מכור"          onClick={() => { setOpenMenuId(null); openSellModal(car.id) }} color="var(--primary)" />
                </>}
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                <MenuItem icon="🗑️" label="מחיקה" onClick={() => { setOpenMenuId(null); deleteCar(car.id) }} color="var(--danger)" />
              </div>
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
    const rows = cars.map(c => ({ לוחית: c.plate, יצרן: c.make ?? '', דגם: c.model ?? '', שנה: c.year ?? '', צבע: c.color ?? '', 'ק"מ': c.km ?? '', סטטוס: c.status ?? '', 'מחיר קנייה': c.buy_price ?? '', 'מחיר מבוקש': c.ask_price ?? '', 'מחיר מכירה': c.sell_price ?? '', הערות: c.notes ?? '' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'רכבים')
    XLSX.writeFile(wb, 'רכבים.xlsx')
  }

  function exportJson() {
    const data = cars.map(c => ({ plate: c.plate, make: c.make, model: c.model, year: c.year, color: c.color, km: c.km, status: c.status, buy_price: c.buy_price, ask_price: c.ask_price, sell_price: c.sell_price, notes: c.notes }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'רכבים.json'; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22 }}>🚗 ניהול רכבים</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>מלאי, קנייה, מכירה ובקשות לקוחות</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExcelMenu onExportExcel={exportExcel} onExportJson={exportJson} />
          <Button onClick={() => openCarForm()}>+ הוסף רכב</Button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(130px, calc(50% - 6px)), 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="במלאי"        value={invCars.length}     />
        <StatCard label="למכירה"       value={invCars.filter(c=>c.status==='available').length} color="var(--primary)" />
        <StatCard label="שמורים"       value={invCars.filter(c=>c.status==='reserved').length}  color="#d97706" />
        {checkCars.length > 0 && <StatCard label="בבדיקה"  value={checkCars.length} color="#0369a1" />}
        {openReqs.length  > 0 && <StatCard label="בקשות פתוחות" value={openReqs.length} color="#7c3aed" />}
        <StatCard label="שווי מלאי"    value={fmt(totalAsk)}      color="var(--accent)" />
        <StatCard label="רווח כולל"    value={fmt(totalProfit)}   color={totalProfit >= 0 ? 'var(--primary)' : 'var(--danger)'} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
        {[
          { key: 'inventory', label: `📦 מלאי (${invCars.length})` },
          { key: 'checking',  label: `🔍 בדיקה${checkCars.length ? ` (${checkCars.length})` : ''}` },
          { key: 'sold',      label: `💰 מכירות (${soldCars.length})` },
          { key: 'requests',  label: `📋 בקשות${openReqs.length ? ` (${openReqs.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{
            padding: '8px 18px', borderRadius: 20, border: '1.5px solid var(--border)',
            background: tab === t.key ? 'var(--primary)' : '#fff',
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: INVENTORY ── */}
      {tab === 'inventory' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {[{ v: 'all', l: 'הכל' }, { v: 'available', l: '🟢 למכירה' }, { v: 'reserved', l: '🟡 שמור' }, { v: 'business', l: '🟣 בשימוש העסק' }].map(f => (
              <button key={f.v} onClick={() => setInvFilter(f.v)} style={{
                padding: '5px 14px', borderRadius: 16, border: '1.5px solid var(--border)',
                background: invFilter === f.v ? 'var(--primary)' : '#fff',
                color: invFilter === f.v ? '#fff' : 'var(--text-muted)',
                fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
              }}>{f.l}</button>
            ))}
          </div>
          {displayInv.length === 0
            ? <Empty icon="📦" text={invFilter === 'all' ? 'אין רכבים במלאי' : 'אין רכבים בסינון זה'} action={invFilter === 'all' ? 'הוסף רכב ראשון' : undefined} onAction={invFilter === 'all' ? () => openCarForm() : undefined} />
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>
                {displayInv.map(c => <div key={c.id}>{CarCard({ car: c })}</div>)}
              </div>
          }
        </>
      )}

      {/* ── TAB: CHECKING ── */}
      {tab === 'checking' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>רכבים שנבדקים לפני קנייה — לחץ "✅ אשר" להעביר למלאי</span>
            <Button onClick={() => { openCarForm(); setCarForm(f => ({ ...f, status: 'checking' })) }}>+ הוסף לבדיקה</Button>
          </div>
          {checkCars.length === 0
            ? <Empty icon="🔍" text="אין רכבים בבדיקה" />
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                      {['תאריך','יצרן / דגם','שנה','לוחית','ק"מ','מחיר מבוקש','איש קשר','הערות','פעולות'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {checkCars.map(car => (
                      <tr key={car.id} style={{ borderBottom: '1px solid var(--border)', background: '#fffbeb' }}>
                        <td style={td()}>{car.created_at?.slice(0,10) || '—'}</td>
                        <td style={td()}><strong>{car.make}</strong> {car.model}</td>
                        <td style={td()}>{car.year || '—'}</td>
                        <td style={{ ...td(), direction: 'ltr', textAlign: 'right' }}>{car.plate || '—'}</td>
                        <td style={td()}>{fmtKm(car.km) || '—'}</td>
                        <td style={{ ...td(), fontWeight: 700, color: 'var(--warning)' }}>{fmt(car.buy_price)}</td>
                        <td style={td()}>{car.contact || '—'}</td>
                        <td style={td()}>{car.notes || '—'}</td>
                        <td style={td()}>
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                const id = `chk-${car.id}`
                                if (openMenuId === id) { setOpenMenuId(null); return }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setMenuPos({ x: rect.left, y: rect.top })
                                setOpenMenuId(id)
                              }}
                              style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, fontWeight: 900, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >⋮</button>
                            {openMenuId === `chk-${car.id}` && (
                              <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 40 }} onMouseDown={() => setOpenMenuId(null)}>
                                <div onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', bottom: window.innerHeight - menuPos.y + 4, left: menuPos.x, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.15)', zIndex: 50, minWidth: 180, overflow: 'hidden' }}>
                                  <MenuItem icon="✏️" label="עריכה"   onClick={() => { setOpenMenuId(null); openCarForm(car) }} />
                                  <MenuItem icon="✅" label="קונה!"   onClick={() => { setOpenMenuId(null); changeCarStatus(car.id, 'available') }} color="var(--primary)" />
                                  <MenuItem icon="❌" label="לא קונה" onClick={() => { setOpenMenuId(null); openDeclineModal(car.id) }} color="var(--danger)" />
                                  <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                                  <MenuItem icon="🗑️" label="מחיקה"   onClick={() => { setOpenMenuId(null); deleteCar(car.id) }} color="var(--danger)" />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
          {declinedCars.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>❌ נדחו בעבר ({declinedCars.length})</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, opacity: 0.75 }}>
                  <tbody>
                    {declinedCars.map(car => (
                      <tr key={car.id} style={{ borderBottom: '1px solid var(--border)', background: '#fff5f5' }}>
                        <td style={td()}><strong>{car.make} {car.model}</strong> {car.year ? `(${car.year})` : ''}</td>
                        <td style={{ ...td(), direction: 'ltr', textAlign: 'right' }}>{car.plate || '—'}</td>
                        <td style={td()}>{fmtKm(car.km) || '—'}</td>
                        <td style={{ ...td(), color: 'var(--danger)', fontSize: 11, maxWidth: 260 }}>{car.notes?.split('\n').filter(l => l.includes('❌')).slice(-1)[0] || '—'}</td>
                        <td style={td()}>
                          <button onClick={() => changeCarStatus(car.id, 'checking')} style={{ ...actionBtn('#0369a1', '#fff'), padding: '3px 10px', fontSize: 11 }}>🔄 החזר לבדיקה</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB: SOLD ── */}
      {tab === 'sold' && (
        <>
          {soldCars.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 18px', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>סה"כ רכבים נמכרו: </span><strong>{soldCars.length}</strong>
                <span style={{ margin: '0 12px', color: 'var(--border)' }}>|</span>
                <span style={{ color: 'var(--text-muted)' }}>רווח כולל: </span>
                <strong style={{ color: totalProfit >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{fmt(totalProfit)}</strong>
              </div>
            </div>
          )}
          {soldCars.length === 0
            ? <Empty icon="💰" text="אין מכירות עדיין" />
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                      {['תאריך מכירה','יצרן / דגם','שנה','לוחית','מחיר קנייה','מחיר מכירה','רווח','קונה','תשלום'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {soldCars.map(car => {
                      const profit = (car.sold_price || 0) - (car.buy_price || 0)
                      return (
                        <tr key={car.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={td()}>{car.sold_date || '—'}</td>
                          <td style={td()}><strong>{car.make}</strong> {car.model}</td>
                          <td style={td()}>{car.year || '—'}</td>
                          <td style={{ ...td(), direction: 'ltr', textAlign: 'right' }}>{car.plate || '—'}</td>
                          <td style={td()}>{fmt(car.buy_price)}</td>
                          <td style={{ ...td(), fontWeight: 700 }}>{fmt(car.sold_price)}</td>
                          <td style={{ ...td(), fontWeight: 700, color: profit >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{fmt(profit)}</td>
                          <td style={td()}>{car.buyer_name || '—'}{car.buyer_phone ? <><br /><small style={{ color: 'var(--text-muted)' }}>{car.buyer_phone}</small></> : ''}</td>
                          <td style={td()}>{car.buyer_payment || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
          }
        </>
      )}

      {/* ── TAB: REQUESTS ── */}
      {tab === 'requests' && (() => {
        const displayReq  = reqFilter === 'all' ? requests      : requests.filter(r => r.status === reqFilter)
        const displaySale = reqFilter === 'all' ? saleRequests  : saleRequests.filter(r => r.status === reqFilter)

        function ReqKebab({ menuKey, onEdit, onDelete, onStatus }: {
          menuKey: string; onEdit: () => void; onDelete: () => void
          onStatus: (s: string, cur: string) => void
        }) {
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px 10px' }}>
              <button
                onClick={e => {
                  e.stopPropagation()
                  if (openMenuId === menuKey) { setOpenMenuId(null); return }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setMenuPos({ x: rect.left, y: rect.top })
                  setOpenMenuId(menuKey)
                }}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, fontWeight: 900, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >⋮</button>
              {openMenuId === menuKey && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 40 }} onMouseDown={() => setOpenMenuId(null)}>
                  <div onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', bottom: window.innerHeight - menuPos.y + 4, left: menuPos.x, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.15)', zIndex: 50, minWidth: 180, overflow: 'hidden' }}>
                    <MenuItem icon="✏️" label="עריכה" onClick={() => { setOpenMenuId(null); onEdit() }} />
                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                    {REQ_STATUSES.filter(s => s.value !== menuKey.split('|')[1]).map(s => (
                      <MenuItem key={s.value} icon="●" label={s.label} color={s.color}
                        onClick={() => { setOpenMenuId(null); onStatus(s.value, menuKey.split('|')[1]) }} />
                    ))}
                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                    <MenuItem icon="🗑️" label="מחיקה" onClick={() => { setOpenMenuId(null); onDelete() }} color="var(--danger)" />
                  </div>
                </div>
              )}
            </div>
          )
        }

        return (
          <>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
              {([{ v: 'buy', l: '🛒 בקשת קנייה', count: requests.filter(r=>r.status==='open').length },
                 { v: 'sell', l: '🏷️ בקשת מכירה', count: saleRequests.filter(r=>r.status==='open').length }] as const).map(t => (
                <button key={t.v} onClick={() => setReqSubTab(t.v)} style={{
                  padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                  color: reqSubTab === t.v ? 'var(--primary)' : 'var(--text-muted)',
                  borderBottom: reqSubTab === t.v ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -2,
                }}>
                  {t.l}{t.count > 0 ? <span style={{ marginRight: 5, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{t.count}</span> : ''}
                </button>
              ))}
            </div>

            {/* Status filters + add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ v: 'all', l: 'הכל' }, { v: 'open', l: 'פתוח' }, { v: 'handled', l: 'טופל' }, { v: 'closed', l: 'נסגר' }].map(f => (
                  <button key={f.v} onClick={() => setReqFilter(f.v)} style={{
                    padding: '5px 14px', borderRadius: 16, border: '1.5px solid var(--border)',
                    background: reqFilter === f.v ? 'var(--primary)' : '#fff',
                    color: reqFilter === f.v ? '#fff' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{f.l}</button>
                ))}
              </div>
              {reqFilter === 'all' && (
                reqSubTab === 'buy'
                  ? <Button onClick={() => openReqForm()}>+ בקשת קנייה</Button>
                  : <Button onClick={() => openSaleReqForm()}>+ בקשת מכירה</Button>
              )}
            </div>

            {/* BUY requests */}
            {reqSubTab === 'buy' && (
              displayReq.length === 0
                ? <Empty icon="🛒" text="אין בקשות קנייה" action={reqFilter === 'all' ? 'הוסף בקשה ראשונה' : undefined} onAction={reqFilter === 'all' ? () => openReqForm() : undefined} />
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>
                    {displayReq.map(req => {
                      const st = REQ_STATUS_MAP[req.status]
                      return (
                        <div key={req.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${st?.color || 'var(--border)'}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ fontWeight: 800, fontSize: 15 }}>{req.name}</div>
                              <span style={{ background: st?.color, color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{st?.label}</span>
                            </div>
                            {req.phone    && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {req.phone}</div>}
                            {req.budget   && <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>עד {fmt(req.budget)}</div>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                              {req.min_year  && <Chip>📅 משנת {req.min_year}</Chip>}
                              {req.max_km    && <Chip>📍 עד {req.max_km.toLocaleString('he-IL')} ק"מ</Chip>}
                              {req.seats     && <Chip>🪑 {req.seats}</Chip>}
                              {req.car_type  && <Chip>{req.car_type}</Chip>}
                              {req.fuel      && <Chip>⛽ {req.fuel}</Chip>}
                              {req.make_pref && <Chip>🚘 {req.make_pref}</Chip>}
                            </div>
                            {req.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{req.notes}</div>}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.created_at?.slice(0,10)}</div>
                          </div>
                          {ReqKebab({ menuKey: `req-${req.id}|${req.status}`, onEdit: () => openReqForm(req), onDelete: () => deleteReq(req.id), onStatus: (s) => changeReqStatus(req.id, s) })}
                        </div>
                      )
                    })}
                  </div>
            )}

            {/* SELL requests */}
            {reqSubTab === 'sell' && (
              displaySale.length === 0
                ? <Empty icon="🏷️" text="אין בקשות מכירה" action={reqFilter === 'all' ? 'הוסף בקשה ראשונה' : undefined} onAction={reqFilter === 'all' ? () => openSaleReqForm() : undefined} />
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18 }}>
                    {displaySale.map(req => {
                      const st = REQ_STATUS_MAP[req.status]
                      const commission = req.commission
                        ? req.commission_type === 'percent' ? `${req.commission}%` : fmt(req.commission)
                        : null
                      return (
                        <div key={req.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${st?.color || 'var(--border)'}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 15 }}>{req.name}</div>
                                {req.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {req.phone}</div>}
                              </div>
                              <span style={{ background: st?.color, color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{st?.label}</span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>
                              {[req.make, req.model, req.year].filter(Boolean).join(' ')}
                              {req.plate && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>• {req.plate}</span>}
                            </div>
                            {req.list_price && <div style={{ fontSize: 18, fontWeight: 900, color: '#0369a1' }}>מחירון: {fmt(req.list_price)}</div>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                              {req.km             && <Chip>{fmtKm(req.km)}</Chip>}
                              {req.hand           && <Chip>יד {req.hand}</Chip>}
                              {req.ownership_type && <Chip>{req.ownership_type}</Chip>}
                              {commission         && <Chip color="#7c3aed">💰 עמלה: {commission}</Chip>}
                              {req.wait_until     && <Chip>⏳ עד: {req.wait_until}</Chip>}
                              {req.car_code       && <Chip>🔖 קוד: {req.car_code}</Chip>}
                              {req.key_hanger     && <Chip>🗝️ מתלה: {req.key_hanger}</Chip>}
                            </div>
                            {req.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{req.notes}</div>}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.created_at?.slice(0,10)}</div>
                          </div>
                          {ReqKebab({ menuKey: `sale-${req.id}|${req.status}`, onEdit: () => openSaleReqForm(req), onDelete: () => deleteSaleReq(req.id), onStatus: (s) => changeSaleReqStatus(req.id, s) })}
                        </div>
                      )
                    })}
                  </div>
            )}
          </>
        )
      })()}

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div
          onClick={e => e.target === e.currentTarget && setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
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
              <Field label="לוחית" required error={carErrors.plate}><input value={carForm.plate} onChange={e => { setCarForm(f=>({...f,plate:e.target.value})); setCarErrors(e=>({...e,plate:false})) }} style={{...inp(carErrors.plate),direction:'ltr'}} placeholder="12-345-67" /></Field>
              <Field label="שנה"><input type="number" value={carForm.year} onChange={e => setCarForm(f=>({...f,year:e.target.value}))} style={inp()} placeholder="2020" /></Field>
              <Field label="ק״מ"><input type="number" value={carForm.km} onChange={e => setCarForm(f=>({...f,km:e.target.value}))} style={inp()} /></Field>
              <Field label="צבע"><input value={carForm.color} onChange={e => setCarForm(f=>({...f,color:e.target.value}))} style={inp()} /></Field>
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
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <Field label="תוקף טסט"><input type="date" value={carForm.test_date} onChange={e => setCarForm(f=>({...f,test_date:e.target.value}))} style={inp()} /></Field>
              <Field label="תוקף ביטוח"><input type="date" value={carForm.insur_date} onChange={e => setCarForm(f=>({...f,insur_date:e.target.value}))} style={inp()} /></Field>
            </Grid>
          </Section>

          {/* Contact */}
          <Section title="פרטים נוספים">
            <Grid cols={2}>
              <Field label="איש קשר / מוכר"><input value={carForm.contact} onChange={e => setCarForm(f=>({...f,contact:e.target.value}))} style={inp()} /></Field>
              <Field label="שם בעלים"><input value={carForm.owner_name} onChange={e => setCarForm(f=>({...f,owner_name:e.target.value}))} style={inp()} /></Field>
            </Grid>
            <Field label="הערות">
              <textarea value={carForm.notes} onChange={e => setCarForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} />
            </Field>
          </Section>

          {/* Photos */}
          <Section title="📷 תמונות (Google Drive)">
            {isAdmin && !driveConnected && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>⚠️ Drive לא מחובר</span>
                <a href={`/api/drive/auth?tenant_id=${tenantId.current}`} style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>חבר עכשיו →</a>
              </div>
            )}
            {photoUrls.map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  value={url}
                  onChange={e => setPhotoUrls(p => p.map((u,j) => j===i ? e.target.value : u))}
                  placeholder="https://drive.google.com/file/d/..."
                  style={{ ...inp(), flex: 1, direction: 'ltr', fontSize: 12 }}
                />
                {url && driveThumb(url) && (
                  <img src={driveThumb(url)} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                )}
                {/* Upload button — admins + Drive connected */}
                {isAdmin && driveConnected && (
                  <label style={{ cursor: 'pointer', flexShrink: 0 }} title="העלה תמונה">
                    <input
                      type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(i, f); e.target.value = '' }}
                    />
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)',
                      background: uploadingIdx === i ? '#f0fdf6' : '#f8fafc',
                      fontSize: 15, cursor: 'pointer',
                    }}>
                      {uploadingIdx === i ? '⏳' : '📤'}
                    </span>
                  </label>
                )}
                <button onClick={() => setPhotoUrls(p => p.filter((_,j) => j!==i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setPhotoUrls(p => [...p, ''])} style={{ fontSize: 12, padding: '5px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              + הוסף תמונה
            </button>
          </Section>

          {/* Car Drive Files */}
          {isAdmin && driveConnected && editCarId && (
            <Section title="📁 קבצי רכב ב-Drive">
              {carDriveLoading ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: '6px 0' }}>טוען...</div>
              ) : (
                <>
                  {carDriveFiles.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>אין קבצים בתיקיית הרכב</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {carDriveFiles.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f8fafc', borderRadius: 7, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 16 }}>{f.mimeType.startsWith('image/') ? '🖼️' : f.mimeType === 'application/pdf' ? '📄' : '📎'}</span>
                        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        {f.webViewLink && (
                          <a href={f.webViewLink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', flexShrink: 0 }}>פתח</a>
                        )}
                        <button onClick={() => deleteCarDriveFile(f.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14, flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <label style={{ cursor: 'pointer' }}>
                    <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCarDriveFile(f); e.target.value = '' }} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {carDriveUploading ? '⏳ מעלה...' : '📤 העלה קובץ'}
                    </span>
                  </label>
                </>
              )}
            </Section>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setCarModal(false)}>ביטול</Button>
          <Button onClick={saveCar}>💾 שמור</Button>
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
                <Button onClick={confirmSell}>✅ אשר מכירה</Button>
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
            <Button variant="danger" onClick={confirmDecline}>❌ לא קונים</Button>
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
            <Button onClick={saveBuyer}>🟡 שמור</Button>
          </div>
        </div>
      </Modal>

      {/* ── REQUEST FORM MODAL ── */}
      {/* ── Sale request modal ── */}
      <Modal open={saleReqModal} onClose={() => setSaleReqModal(false)} title={editSaleReqId ? 'עריכת בקשת מכירה' : '🏷️ בקשת מכירה חדשה'} maxWidth={620}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Grid cols={2}>
            <Field label="שם לקוח *"><input value={saleReqForm.name} onChange={e => setSaleReqForm(f=>({...f,name:e.target.value}))} style={inp()} autoFocus /></Field>
            <Field label="טלפון"><input type="tel" value={saleReqForm.phone} onChange={e => setSaleReqForm(f=>({...f,phone:e.target.value}))} style={inp()} /></Field>
          </Grid>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>פרטי הרכב למכירה</div>
            <PlateInput module="cars" onFill={handleSaleReqApiData} />
            <div style={{ marginTop: 10 }} />
            <Grid cols={4}>
              <Field label="יצרן"><input value={saleReqForm.make} onChange={e => setSaleReqForm(f=>({...f,make:e.target.value}))} style={inp()} /></Field>
              <Field label="דגם"><input value={saleReqForm.model} onChange={e => setSaleReqForm(f=>({...f,model:e.target.value}))} style={inp()} /></Field>
              <Field label="שנה"><input type="number" value={saleReqForm.year} onChange={e => setSaleReqForm(f=>({...f,year:e.target.value}))} style={inp()} placeholder="2019" /></Field>
              <Field label="יד"><input type="number" value={saleReqForm.hand} onChange={e => setSaleReqForm(f=>({...f,hand:e.target.value}))} style={inp()} placeholder="1" min="1" max="9" /></Field>
            </Grid>
            <Grid cols={3}>
              <Field label="ק״מ"><input type="number" value={saleReqForm.km} onChange={e => setSaleReqForm(f=>({...f,km:e.target.value}))} style={inp()} placeholder="80000" /></Field>
              <Field label="סוג בעלות"><input value={saleReqForm.ownership_type} onChange={e => setSaleReqForm(f=>({...f,ownership_type:e.target.value}))} style={inp()} placeholder="פרטי / ליסינג..." /></Field>
              <Field label="קוד רכב"><input value={saleReqForm.car_code} onChange={e => setSaleReqForm(f=>({...f,car_code:e.target.value}))} style={inp()} placeholder="אם יש" /></Field>
            </Grid>
            <Grid cols={2}>
              <Field label="לוחית רישוי"><input value={saleReqForm.plate} onChange={e => setSaleReqForm(f=>({...f,plate:e.target.value}))} style={inp()} /></Field>
              <Field label="מספר מתלה / מפתח"><input value={saleReqForm.key_hanger} onChange={e => setSaleReqForm(f=>({...f,key_hanger:e.target.value}))} style={inp()} placeholder="לדוגמה: A12" /></Field>
            </Grid>
          </div>
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>מחיר ועמלה</div>
            <Grid cols={2}>
              <Field label="מחיר מחירון (₪)"><input type="number" value={saleReqForm.list_price} onChange={e => setSaleReqForm(f=>({...f,list_price:e.target.value}))} style={inp()} /></Field>
              <Field label="עמלת מכירה">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 3 }}>
                    {([{ v: 'fixed', l: '₪ סכום קבוע' }, { v: 'percent', l: '% אחוזים' }] as const).map(opt => (
                      <button key={opt.v} type="button"
                        onClick={() => setSaleReqForm(f => ({ ...f, commission_type: opt.v }))}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                          background: saleReqForm.commission_type === opt.v ? '#fff' : 'transparent',
                          color: saleReqForm.commission_type === opt.v ? '#7c3aed' : 'var(--text-muted)',
                          boxShadow: saleReqForm.commission_type === opt.v ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
                          transition: 'all .15s',
                        }}
                      >{opt.l}</button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={saleReqForm.commission}
                    onChange={e => setSaleReqForm(f => ({ ...f, commission: e.target.value }))}
                    placeholder={saleReqForm.commission_type === 'percent' ? 'לדוגמה: 5' : 'לדוגמה: 1500'}
                    style={inp()}
                  />
                </div>
              </Field>
            </Grid>
            <Field label="⏳ המתנה — עד תאריך"><input type="date" value={saleReqForm.wait_until} onChange={e => setSaleReqForm(f=>({...f,wait_until:e.target.value}))} style={inp()} /></Field>
          </div>
          <Grid cols={2}>
            <Field label="סטטוס">
              <select value={saleReqForm.status} onChange={e => setSaleReqForm(f=>({...f,status:e.target.value}))} style={inp()}>
                <option value="open">פתוח</option>
                <option value="handled">טופל</option>
                <option value="closed">נסגר</option>
              </select>
            </Field>
          </Grid>
          <Field label="הערות"><textarea value={saleReqForm.notes} onChange={e => setSaleReqForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setSaleReqModal(false)}>ביטול</Button>
            <Button onClick={saveSaleReq}>💾 שמור</Button>
          </div>
        </div>
      </Modal>

      <Modal open={reqModal} onClose={() => setReqModal(false)} title={editReqId ? 'עריכת בקשת קנייה' : '🛒 בקשת קנייה חדשה'} maxWidth={620}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Grid cols={2}>
            <Field label="שם לקוח *"><input value={reqForm.name} onChange={e => setReqForm(f=>({...f,name:e.target.value}))} style={inp()} autoFocus /></Field>
            <Field label="טלפון"><input type="tel" value={reqForm.phone} onChange={e => setReqForm(f=>({...f,phone:e.target.value}))} style={inp()} /></Field>
          </Grid>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
            <Grid cols={2}>
              <Field label="💰 תקציב מקסימלי (₪)"><input type="number" value={reqForm.budget} onChange={e => setReqForm(f=>({...f,budget:e.target.value}))} style={inp()} /></Field>
              <Field label="📅 שנת ייצור מינימלית"><input type="number" value={reqForm.min_year} onChange={e => setReqForm(f=>({...f,min_year:e.target.value}))} style={inp()} placeholder="2015" /></Field>
            </Grid>
          </div>
          <Grid cols={3}>
            <Field label="ק״מ מקסימלי"><input type="number" value={reqForm.max_km} onChange={e => setReqForm(f=>({...f,max_km:e.target.value}))} style={inp()} placeholder="150000" /></Field>
            <Field label="מס׳ מושבים">
              <select value={reqForm.seats} onChange={e => setReqForm(f=>({...f,seats:e.target.value}))} style={inp()}>
                <option value="">לא משנה</option>
                {['2','4','5','7','8+'].map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="סוג רכב">
              <select value={reqForm.car_type} onChange={e => setReqForm(f=>({...f,car_type:e.target.value}))} style={inp()}>
                <option value="">לא משנה</option>
                {["פרטי","ג'יפ / SUV","ואן","מסחרי","אחר"].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="סוג דלק">
              <select value={reqForm.fuel} onChange={e => setReqForm(f=>({...f,fuel:e.target.value}))} style={inp()}>
                <option value="">לא משנה</option>
                {['בנזין','דיזל','היברידי','חשמלי'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="מותג מועדף"><input value={reqForm.make_pref} onChange={e => setReqForm(f=>({...f,make_pref:e.target.value}))} style={inp()} placeholder="טויוטה, יונדאי..." /></Field>
            <Field label="סטטוס">
              <select value={reqForm.status} onChange={e => setReqForm(f=>({...f,status:e.target.value}))} style={inp()}>
                <option value="open">פתוח</option>
                <option value="handled">טופל</option>
                <option value="closed">נסגר</option>
              </select>
            </Field>
          </Grid>
          <Field label="הערות"><textarea value={reqForm.notes} onChange={e => setReqForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp(),resize:'vertical'}} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setReqModal(false)}>ביטול</Button>
            <Button onClick={saveReq}>💾 שמור</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Mini UI helpers ───────────────────────────────────────────────────────────

function MenuItem({ icon, label, onClick, color }: { icon: string; label: string; onClick: () => void; color?: string }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: hover ? '#f8fafc' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: color || 'var(--text)', textAlign: 'right' }}
    >
      <span>{icon}</span><span>{label}</span>
    </button>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.07)', minWidth: 110 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

function Chip({ children, color, muted }: { children: React.ReactNode; color?: string; muted?: boolean }) {
  return (
    <span style={{ background: '#f1f5f9', padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: color || (muted ? 'var(--text-muted)' : 'var(--text)') }}>
      {children}
    </span>
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
function td(): React.CSSProperties {
  return { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
}
function actionBtn(bg = '#fff', color = 'var(--text)'): React.CSSProperties {
  return { flex: 1, padding: '7px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1.5px solid var(--border)', background: bg, color, cursor: 'pointer', fontFamily: 'inherit', minWidth: 36 }
}
function lbBtn(): React.CSSProperties {
  return { background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }
}
