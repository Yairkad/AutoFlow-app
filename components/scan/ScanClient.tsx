'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

const LOAD_INDICES  = ['60','62','65','67','69','71','73','75','77','80','82','84','85','86','87','88','89','90','91','92','93','94','95','96','98','99','100','101','102','103','104','105','106','107','108','109','110','112','114','116','118','120','121','122','124','126']
const SPEED_INDICES = ['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','Y','ZR','Z']
const WIDTHS   = [145,155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315]
const PROFILES = [25,30,35,40,45,50,55,60,65,70,75,80]
const RIMS     = [13,14,15,16,17,18,19,20,21,22]

const emptyNewTire = { brand: '', width: '', profile: '', rim: '', sku: '', load_idx: '', speed_idx: '', qty: '1', cost_price: '', sell_price: '', location: '', notes: '', condition: 'new' as 'new' | 'used', tire_type: 'regular' as 'regular' | 'reinforced' | 'commercial' }

interface InventoryItem {
  id: string
  type: 'tire' | 'product'
  name: string
  sku: string | null
  barcode: string | null
  qty: number
}

interface EditForm {
  // shared
  sku: string; qty: string; sell_price: string; cost_price: string; notes: string
  // tires
  brand: string; load_idx: string; speed_idx: string; location: string
  condition: 'new' | 'used'; tire_type: 'regular' | 'reinforced' | 'commercial'
  // products
  name: string; barcode: string; category: string; unit: string
}

interface CountEntry {
  item: InventoryItem
  counted: number
}

type NotFoundAction = 'link' | 'newTire' | null
type Mode = 'scan' | 'count'

export default function ScanClient() {
  const sb = createClient()
  const { profile } = useProfile()
  const router = useRouter()
  const isMobile = useIsMobile()
  const scanRef     = useRef<HTMLInputElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)
  const modeRef     = useRef<Mode>('scan')
  const countMapRef = useRef<Record<string, CountEntry>>({})
  const tenantIdRef = useRef<string>('')

  const [barcodeInput, setBarcodeInput] = useState('')
  const [textFilter,   setTextFilter]   = useState('')
  const [items,        setItems]        = useState<InventoryItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [mode,         setMode]         = useState<Mode>('scan')

  // scan mode
  const [foundItem,    setFoundItem]    = useState<InventoryItem | null>(null)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [action,       setAction]       = useState<NotFoundAction>(null)
  const [linkSearch,   setLinkSearch]   = useState('')
  const [savingLink,   setSavingLink]   = useState(false)
  const [newTireForm,  setNewTireForm]  = useState(emptyNewTire)
  const [savingNew,    setSavingNew]    = useState(false)

  // edit
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ sku: '', qty: '', sell_price: '', cost_price: '', notes: '', brand: '', load_idx: '', speed_idx: '', location: '', condition: 'new', tire_type: 'regular', name: '', barcode: '', category: '', unit: 'יח׳' })
  const [saving,   setSaving]   = useState(false)

  // count mode
  const [countEntries, setCountEntries]   = useState<CountEntry[]>([])  // display list (ordered)
  const [unknownCodes, setUnknownCodes]   = useState<string[]>([])
  const [showConfirm,  setShowConfirm]    = useState(false)
  const [savingCount,  setSavingCount]    = useState(false)
  const [lastScanned,  setLastScanned]    = useState<string | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const refocus = () => setTimeout(() => scanRef.current?.focus(), 120)

  // keep refs in sync
  useEffect(() => { modeRef.current = mode }, [mode])

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (tenantId: string) => {
    setLoading(true)
    const [{ data: tires }, { data: products }] = await Promise.all([
      sb.from('tires').select('id,brand,width,profile,rim,sku,qty').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      sb.from('products').select('id,name,sku,barcode,qty').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    ])
    const tireItems: InventoryItem[] = (tires ?? []).map(t => ({
      id: t.id, type: 'tire', name: `${t.brand ?? ''} ${t.width}/${t.profile}R${t.rim}`.trim(),
      sku: t.sku ?? null, barcode: t.sku ?? null, qty: t.qty,
    }))
    const prodItems: InventoryItem[] = (products ?? []).map(p => ({
      id: p.id, type: 'product', name: p.name, sku: p.sku ?? null, barcode: p.barcode ?? null, qty: p.qty,
    }))
    setItems([...tireItems, ...prodItems])
    setLoading(false)
  }, [sb])

  useEffect(() => {
    if (!profile) return
    tenantIdRef.current = profile.tenantId
    load(profile.tenantId)
  }, [profile, load])
  useEffect(() => { scanRef.current?.focus() }, [])

  // ── Debounce trigger ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!barcodeInput.trim()) return
    const t = setTimeout(() => {
      const code = barcodeInput.trim()
      setBarcodeInput('')
      if (modeRef.current === 'count') handleCountScan(code)
      else handleScan(code)
    }, 200)
    return () => clearTimeout(t)
  }, [barcodeInput]) // eslint-disable-line

  // ── Normal scan ───────────────────────────────────────────────────────────
  function findItem(code: string) {
    return items.find(i => (i.barcode && i.barcode === code) || (i.sku && i.sku === code))
  }

  function handleScan(code: string) {
    const match = findItem(code)
    if (match) { setFoundItem(match); setNotFoundCode(null) }
    else { setFoundItem(null); setNotFoundCode(code); setAction(null); setLinkSearch('') }
    refocus()
  }

  // ── Count scan ────────────────────────────────────────────────────────────
  function handleCountScan(code: string) {
    const match = findItem(code)
    setLastScanned(match ? match.name : `❓ ${code}`)
    if (!match) {
      setUnknownCodes(p => p.includes(code) ? p : [...p, code])
      refocus()
      return
    }
    const prev = countMapRef.current[match.id]
    const newCount = (prev?.counted ?? 0) + 1
    countMapRef.current[match.id] = { item: match, counted: newCount }
    setCountEntries(Object.values(countMapRef.current).sort((a, b) => b.counted - a.counted))
    refocus()
  }

  // ── Start / stop count mode ───────────────────────────────────────────────
  function startCount() {
    countMapRef.current = {}
    setCountEntries([])
    setUnknownCodes([])
    setLastScanned(null)
    setMode('count')
    refocus()
  }

  function cancelCount() {
    setMode('scan')
    setShowConfirm(false)
    refocus()
  }

  async function confirmCount() {
    setSavingCount(true)
    const entries = Object.values(countMapRef.current)
    for (const entry of entries) {
      if (entry.item.type === 'tire') {
        await sb.from('tires').update({ qty: entry.counted }).eq('id', entry.item.id)
      } else {
        await sb.from('products').update({ qty: entry.counted }).eq('id', entry.item.id)
      }
    }
    setSavingCount(false)
    setShowConfirm(false)
    setMode('scan')
    showToast(`ספירה הושלמה — ${entries.length} פריטים עודכנו ✓`)
    await load(tenantIdRef.current)
    refocus()
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  async function openEdit(item: InventoryItem) {
    setFoundItem(null); setNotFoundCode(null)
    if (item.type === 'tire') {
      const { data } = await sb.from('tires').select('brand,width,profile,rim,sku,qty,sell_price,cost_price,load_idx,speed_idx,location,notes,condition,tire_type').eq('id', item.id).single()
      setEditForm({
        brand: data?.brand ?? '', sku: data?.sku ?? '', barcode: '',
        load_idx: data?.load_idx ?? '', speed_idx: data?.speed_idx ?? '',
        qty: String(data?.qty ?? 0), sell_price: String(data?.sell_price ?? ''),
        cost_price: String(data?.cost_price ?? ''), location: data?.location ?? '',
        notes: data?.notes ?? '', condition: data?.condition ?? 'new', tire_type: data?.tire_type ?? 'regular',
        name: '', category: '', unit: 'יח׳',
      })
    } else {
      const { data } = await sb.from('products').select('name,sku,barcode,qty,sell_price,buy_price,category,unit,notes').eq('id', item.id).single()
      setEditForm({
        name: data?.name ?? '', sku: data?.sku ?? '', barcode: data?.barcode ?? '',
        category: data?.category ?? '', unit: data?.unit ?? 'יח׳',
        qty: String(data?.qty ?? 0), sell_price: String(data?.sell_price ?? ''),
        cost_price: String(data?.buy_price ?? ''), notes: data?.notes ?? '',
        brand: '', load_idx: '', speed_idx: '', location: '', condition: 'new', tire_type: 'regular',
      })
    }
    setEditItem(item)
  }


  async function saveEdit() {
    if (!editItem) return
    setSaving(true)
    const qty        = parseInt(editForm.qty) || 0
    const sell_price = parseFloat(editForm.sell_price) || null
    const cost_price = parseFloat(editForm.cost_price) || null
    if (editItem.type === 'tire') {
      await sb.from('tires').update({
        brand: editForm.brand.trim() || null,
        sku: editForm.sku.trim() || null,
        load_idx: editForm.load_idx || null,
        speed_idx: editForm.speed_idx || null,
        qty, sell_price, cost_price,
        location: editForm.location.trim() || null,
        notes: editForm.notes.trim() || null,
        condition: editForm.condition,
        tire_type: editForm.tire_type,
      }).eq('id', editItem.id)
    } else {
      await sb.from('products').update({
        name: editForm.name.trim() || editItem.name,
        sku: editForm.sku.trim() || null,
        barcode: editForm.barcode.trim() || null,
        category: editForm.category.trim() || null,
        unit: editForm.unit || 'יח׳',
        qty, sell_price, buy_price: cost_price,
        notes: editForm.notes.trim() || null,
      }).eq('id', editItem.id)
    }
    setSaving(false); setEditItem(null); showToast('נשמר ✓'); await load(tenantIdRef.current); refocus()
  }

  // ── Link barcode ──────────────────────────────────────────────────────────
  async function saveBarcode(item: InventoryItem, code: string) {
    setSavingLink(true)
    if (item.type === 'tire') await sb.from('tires').update({ sku: code }).eq('id', item.id)
    else await sb.from('products').update({ barcode: code }).eq('id', item.id)
    setSavingLink(false); setNotFoundCode(null); setAction(null)
    showToast(`ברקוד שויך ל-${item.name} ✓`); await load(tenantIdRef.current); refocus()
  }

  function openNewTire(code: string) {
    setNewTireForm({ ...emptyNewTire, sku: code })
    setAction('newTire')
  }

  async function createTire() {
    const f = newTireForm
    if (!f.width || !f.profile || !f.rim) return
    setSavingNew(true)
    await sb.from('tires').insert({
      tenant_id:  tenantIdRef.current,
      brand:      f.brand.trim() || null,
      width:      Number(f.width),
      profile:    Number(f.profile),
      rim:        Number(f.rim),
      sku:        f.sku.trim() || null,
      load_idx:   f.load_idx || null,
      speed_idx:  f.speed_idx || null,
      qty:        parseInt(f.qty) || 1,
      cost_price: parseFloat(f.cost_price) || null,
      sell_price: parseFloat(f.sell_price) || null,
      location:   f.location.trim() || null,
      notes:      f.notes.trim() || null,
      condition:  f.condition,
      tire_type:  f.tire_type,
    })
    setSavingNew(false)
    setNotFoundCode(null)
    setAction(null)
    showToast('צמיג נוצר ✓')
    await load(tenantIdRef.current)
    refocus()
  }

  const closeModal = () => { setFoundItem(null); setNotFoundCode(null); setAction(null); refocus() }
  const setEF = (k: keyof EditForm, v: string) => setEditForm(p => ({ ...p, [k]: v }))

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = items.filter(i => {
    if (!textFilter.trim()) return true
    const q = textFilter.toLowerCase()
    return i.name.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q) || (i.barcode ?? '').toLowerCase().includes(q)
  })
  const linkFiltered = items.filter(i => {
    if (!linkSearch.trim()) return true
    const q = linkSearch.toLowerCase()
    return i.name.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q)
  }).slice(0, 30)

  const BADGE = (type: 'tire' | 'product') => (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: type === 'tire' ? '#1e293b' : '#fff7ed', color: type === 'tire' ? '#fff' : '#c2410c', border: type === 'product' ? '1px solid #fed7aa' : 'none' }}>
      {type === 'tire' ? 'צמיג' : 'מוצר'}
    </span>
  )

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px' }}>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-green-700 text-white font-bold rounded-xl px-6 py-3 shadow-xl">{toast}</div>
      )}

      {/* Header */}
      <div className={`flex mb-5 ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`}>
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={() => router.back()} className="text-slate-500 font-bold active:text-slate-800 transition-colors" style={{ fontSize: '20px', lineHeight: 1 }}>←</button>
          )}
          <svg viewBox="0 0 28 22" width="22" height="17" fill="#334155"><rect x="0" y="0" width="2" height="22"/><rect x="4" y="0" width="1" height="22"/><rect x="7" y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/><rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/><rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/></svg>
          <h1 className="font-black text-slate-800" style={{ fontSize: isMobile ? '20px' : '24px' }}>{mode === 'count' ? '📦 ספירת מלאי' : 'סריקת ברקוד'}</h1>
        </div>
        {mode === 'scan' ? (
          <button onClick={startCount} className={`bg-slate-800 text-white font-bold rounded-xl active:brightness-90 transition-all ${isMobile ? 'w-full' : ''}`} style={{ padding: '10px 18px', fontSize: '14px' }}>
            📦 התחל ספירת מלאי
          </button>
        ) : (
          <div className={`flex gap-2 ${isMobile ? 'w-full' : ''}`}>
            <button onClick={() => setShowConfirm(true)} disabled={countEntries.length === 0}
              className="flex-1 bg-green-700 text-white font-bold rounded-xl active:brightness-90 disabled:opacity-40 transition-all" style={{ padding: '10px 14px', fontSize: isMobile ? '13px' : '14px' }}>
              ✓ סיים ועדכן מלאי
            </button>
            <button onClick={cancelCount} className="border-2 border-slate-300 text-slate-600 font-bold rounded-xl active:bg-slate-50 transition-all" style={{ padding: '10px 14px', fontSize: '14px' }}>
              ביטול
            </button>
          </div>
        )}
      </div>

      {/* Scan input */}
      <div className={`rounded-2xl shadow-md mb-6 border-2 ${mode === 'count' ? 'border-amber-400 bg-amber-50' : 'border-blue-400 bg-white'}`} style={{ padding: '16px 20px' }}>
        <label className={`block text-sm font-bold mb-2 ${mode === 'count' ? 'text-amber-700' : 'text-blue-700'}`}>
          {mode === 'count' ? '📦 סורק לספירה — סרוק כל פריט בזה אחר זה' : 'סרוק ברקוד'}
        </label>
        <input
          ref={scanRef}
          type="text" inputMode="none"
          value={barcodeInput}
          onChange={e => setBarcodeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) { setBarcodeInput(''); if (modeRef.current === 'count') handleCountScan(v); else handleScan(v) } } }}
          placeholder={mode === 'count' ? 'פוקוס כאן — סרוק...' : 'הכנס פוקוס כאן וסרוק...'}
          className={`w-full border-2 rounded-xl font-bold outline-none transition-colors ${mode === 'count' ? 'border-amber-300 bg-amber-100 focus:border-amber-500' : 'border-slate-200 bg-blue-50 focus:border-blue-500'}`}
          style={{ padding: '12px 16px', fontSize: '18px', letterSpacing: '3px', direction: 'ltr' }}
        />
        {mode === 'count' && lastScanned && (
          <p className="text-sm font-semibold mt-2 text-amber-800">↳ נסרק: {lastScanned}</p>
        )}
        {mode !== 'count' && <p className="text-xs text-slate-400 mt-2">הסורק מזהה אוטומטית · אפשר גם להקליד ולחוץ Enter</p>}
      </div>

      {/* COUNT MODE — running list */}
      {mode === 'count' && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden mb-6">
          <div className="bg-amber-50 border-b border-amber-200 flex items-center justify-between" style={{ padding: '12px 18px' }}>
            <span className="font-bold text-amber-800">פריטים שנספרו ({countEntries.length})</span>
            {unknownCodes.length > 0 && (
              <span className="text-red-500 font-semibold text-sm">⚠ {unknownCodes.length} ברקודים לא זוהו</span>
            )}
          </div>
          {countEntries.length === 0 ? (
            <div className="text-center text-slate-400 py-10">עדיין לא נסרקו פריטים</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '40vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#fffbeb', zIndex: 1 }}>
                  <tr>
                    <th style={thSt}>פריט</th>
                    {!isMobile && <th style={thSt}>סוג</th>}
                    <th style={{ ...thSt, textAlign: 'center' }}>נספר</th>
                    <th style={{ ...thSt, textAlign: 'center' }}>במלאי</th>
                    <th style={{ ...thSt, textAlign: 'center' }}>הפרש</th>
                  </tr>
                </thead>
                <tbody>
                  {countEntries.map((e, i) => {
                    const diff = e.counted - e.item.qty
                    return (
                      <tr key={e.item.id} style={{ borderBottom: '1px solid #fef3c7', background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{e.item.name}</td>
                        {!isMobile && <td style={tdSt}>{BADGE(e.item.type)}</td>}
                        <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800, fontSize: '16px', color: '#d97706' }}>{e.counted}</td>
                        <td style={{ ...tdSt, textAlign: 'center', color: '#64748b' }}>{e.item.qty}</td>
                        <td style={{ ...tdSt, textAlign: 'center', fontWeight: 700, color: diff > 0 ? '#16a34a' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
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

      {/* INVENTORY LIST (scan mode) */}
      {mode === 'scan' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className={`border-b border-slate-100 ${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'}`} style={{ padding: '12px 14px' }}>
            <span className="font-bold text-slate-700">מלאי ({items.length} פריטים)</span>
            <input value={textFilter} onChange={e => setTextFilter(e.target.value)}
              placeholder="סנן לפי שם / מק״ט / ברקוד..."
              className="border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-blue-400 transition-colors"
              style={{ padding: '6px 12px', fontSize: '13px', width: isMobile ? '100%' : '220px' }} />
          </div>
          {loading ? (
            <div className="text-center text-slate-400 py-10">טוען...</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '55vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    {!isMobile && <th style={thSt}>סוג</th>}
                    {!isMobile && <th style={thSt}>מק״ט</th>}
                    {!isMobile && <th style={thSt}>ברקוד</th>}
                    <th style={thSt}>פריט</th>
                    <th style={{ ...thSt, textAlign: 'center' }}>כמות</th>
                    <th style={thSt}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      {!isMobile && <td style={tdSt}>{BADGE(item.type)}</td>}
                      {!isMobile && <td style={{ ...tdSt, fontFamily: 'monospace', color: '#64748b' }}>{item.sku || '—'}</td>}
                      {!isMobile && <td style={{ ...tdSt, fontFamily: 'monospace', color: '#64748b' }}>{item.type === 'product' ? (item.barcode || '—') : '—'}</td>}
                      <td style={{ ...tdSt, fontWeight: 600 }}>
                        {item.name}
                        {isMobile && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{item.type === 'tire' ? 'צמיג' : 'מוצר'}{item.sku ? ` · ${item.sku}` : ''}</span>}
                      </td>
                      <td style={{ ...tdSt, textAlign: 'center', fontWeight: 700, color: item.qty === 0 ? '#ef4444' : item.qty <= 2 ? '#f59e0b' : '#16a34a' }}>{item.qty}</td>
                      <td style={tdSt}>
                        <button onClick={() => openEdit(item)} className="text-blue-600 font-bold hover:underline" style={{ fontSize: '12px' }}>ערוך ←</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>אין תוצאות</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── COUNT CONFIRM MODAL ── */}
      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} width={520}>
          <p className="font-black text-slate-800 text-xl mb-1">אישור ספירת מלאי</p>
          <p className="text-slate-500 text-sm mb-4">הכמויות הבאות יעודכנו בבסיס הנתונים:</p>
          <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                <tr>
                  <th style={thSt}>פריט</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>היה</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>נספר</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>הפרש</th>
                </tr>
              </thead>
              <tbody>
                {countEntries.map((e, i) => {
                  const diff = e.counted - e.item.qty
                  return (
                    <tr key={e.item.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ ...tdSt, fontWeight: 600 }}>{e.item.name}</td>
                      <td style={{ ...tdSt, textAlign: 'center', color: '#64748b' }}>{e.item.qty}</td>
                      <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800, color: '#d97706' }}>{e.counted}</td>
                      <td style={{ ...tdSt, textAlign: 'center', fontWeight: 700, color: diff > 0 ? '#16a34a' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                        {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {unknownCodes.length > 0 && (
            <p className="text-red-500 text-sm font-semibold mb-4">⚠ {unknownCodes.length} ברקודים לא זוהו ולא יעודכנו</p>
          )}
          <div className="flex gap-3">
            <button onClick={confirmCount} disabled={savingCount}
              className="flex-1 bg-green-700 text-white rounded-xl font-bold disabled:opacity-50 active:brightness-90 transition-all" style={{ padding: '12px' }}>
              {savingCount ? 'מעדכן...' : `✓ אשר ועדכן ${countEntries.length} פריטים`}
            </button>
            <button onClick={() => setShowConfirm(false)}
              className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all" style={{ padding: '12px' }}>
              חזרה
            </button>
          </div>
        </Modal>
      )}

      {/* ── FOUND MODAL ── */}
      {foundItem && (
        <Modal onClose={closeModal}>
          <div className="flex items-center gap-2 mb-3">{BADGE(foundItem.type)}<span className="text-green-600 font-bold text-sm">✓ נמצא</span></div>
          <p className="font-black text-slate-800 text-xl mb-1">{foundItem.name}</p>
          {foundItem.sku && <p className="text-slate-400 text-sm mb-1">מק״ט: {foundItem.sku}</p>}
          <p className="text-slate-500 text-sm mb-5">כמות: <span style={{ fontWeight: 700, color: foundItem.qty === 0 ? '#ef4444' : '#16a34a' }}>{foundItem.qty}</span></p>
          <div className="flex gap-3">
            <button onClick={() => openEdit(foundItem)} className="flex-1 bg-blue-600 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '11px' }}>✏️ ערוך כאן</button>
            <button onClick={closeModal} className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all" style={{ padding: '11px' }}>סגור</button>
          </div>
        </Modal>
      )}

      {/* ── NOT FOUND MODAL ── */}
      {notFoundCode && (
        <Modal onClose={closeModal} width={action === 'link' ? 500 : action === 'newTire' ? 480 : 380}>
          {action === null && (
            <>
              <p className="font-bold text-slate-500 text-sm mb-1">ברקוד:</p>
              <p className="font-black text-slate-800 text-lg mb-1" style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>{notFoundCode}</p>
              <p className="text-red-500 font-semibold text-sm mb-6">לא נמצא במלאי</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => setAction('link')} className="w-full bg-blue-600 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '13px' }}>שייך לפריט קיים</button>
                <button onClick={() => openNewTire(notFoundCode!)} className="w-full bg-slate-800 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '13px' }}>+ הקם צמיג חדש</button>
                <button onClick={() => { closeModal(); window.location.href = '/products' }} className="w-full bg-orange-500 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '13px' }}>הקם מוצר חדש ←</button>
                <button onClick={closeModal} className="text-slate-400 text-sm font-semibold mt-1 hover:text-slate-600">ביטול</button>
              </div>
            </>
          )}
          {action === 'link' && (
            <>
              <p className="font-bold text-slate-700 mb-3">שייך ברקוד <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 7px', borderRadius: '6px' }}>{notFoundCode}</span> לפריט:</p>
              <input ref={searchRef} autoFocus value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
                placeholder="חפש לפי שם או מק״ט..."
                className="w-full border-2 border-blue-300 rounded-xl outline-none focus:border-blue-500 transition-colors mb-3"
                style={{ padding: '10px 14px', fontSize: '14px' }} />
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                {linkFiltered.map(item => (
                  <button key={item.id} disabled={savingLink} onClick={() => saveBarcode(item, notFoundCode!)}
                    className="w-full flex items-center justify-between active:bg-blue-50 transition-colors disabled:opacity-50"
                    style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                    <div className="text-right">
                      <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      {item.sku && <p className="text-slate-400 text-xs">{item.sku}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">{BADGE(item.type)}<span className="text-blue-600 font-bold text-sm">שייך ←</span></div>
                  </button>
                ))}
                {linkFiltered.length === 0 && <p className="text-center text-slate-400 py-6 text-sm">לא נמצאו פריטים</p>}
              </div>
              <button onClick={() => setAction(null)} className="text-slate-400 text-sm font-semibold mt-3 hover:text-slate-600">← חזרה</button>
            </>
          )}

          {action === 'newTire' && (() => {
            const ntf = (k: keyof typeof emptyNewTire, v: string) => setNewTireForm(p => ({ ...p, [k]: v }))
            return (
              <>
                <p className="font-bold text-slate-700 mb-3">
                  צמיג חדש · ברקוד: <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 7px', borderRadius: '6px' }}>{notFoundCode}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="רוחב *">
                    <select className="form-input" value={newTireForm.width} onChange={e => ntf('width', e.target.value)}>
                      <option value="">—</option>
                      {WIDTHS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="פרופיל *">
                    <select className="form-input" value={newTireForm.profile} onChange={e => ntf('profile', e.target.value)}>
                      <option value="">—</option>
                      {PROFILES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="חישוק *">
                    <select className="form-input" value={newTireForm.rim} onChange={e => ntf('rim', e.target.value)}>
                      <option value="">—</option>
                      {RIMS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="מותג"><input className="form-input" value={newTireForm.brand} onChange={e => ntf('brand', e.target.value)} placeholder="Michelin..." /></Field>
                <Field label="מקט / ברקוד">
                  <input className="form-input" value={newTireForm.sku} onChange={e => ntf('sku', e.target.value)} style={{ fontFamily: 'monospace' }} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="אינדקס עומס">
                    <input className="form-input" list="new-load-opts" value={newTireForm.load_idx} onChange={e => ntf('load_idx', e.target.value)} placeholder="בחר או הקלד..." />
                    <datalist id="new-load-opts">
                      {LOAD_INDICES.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </Field>
                  <Field label="אינדקס מהירות">
                    <input className="form-input" list="new-speed-opts" value={newTireForm.speed_idx} onChange={e => ntf('speed_idx', e.target.value)} placeholder="בחר או הקלד..." />
                    <datalist id="new-speed-opts">
                      {SPEED_INDICES.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="כמות"><input className="form-input" type="number" min={1} value={newTireForm.qty} onChange={e => ntf('qty', e.target.value)} /></Field>
                  <Field label="מחיר קנייה"><input className="form-input" type="number" min={0} value={newTireForm.cost_price} onChange={e => ntf('cost_price', e.target.value)} /></Field>
                  <Field label="מחיר מכירה"><input className="form-input" type="number" min={0} value={newTireForm.sell_price} onChange={e => ntf('sell_price', e.target.value)} /></Field>
                </div>
                <Field label="מצב הצמיג">
                  <div className="flex gap-2">
                    {(['new', 'used'] as const).map(c => (
                      <button key={c} type="button" onClick={() => ntf('condition', c)} style={{
                        flex: 1, padding: '8px', border: `2px solid ${newTireForm.condition === c ? (c === 'used' ? '#f59e0b' : '#16a34a') : '#e2e8f0'}`,
                        borderRadius: '8px', cursor: 'pointer', fontWeight: newTireForm.condition === c ? 700 : 400, fontSize: '13px',
                        background: newTireForm.condition === c ? (c === 'used' ? '#fef3c7' : '#f0fdf4') : '#fff',
                        color: newTireForm.condition === c ? (c === 'used' ? '#92400e' : '#16a34a') : '#64748b',
                      }}>
                        {c === 'new' ? '✓ חדש' : '♻ משומש'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="סוג צמיג">
                  <div className="flex gap-2">
                    {([
                      ['regular',    'רגיל',  '#e2e8f0', '#fff',    '#64748b'],
                      ['reinforced', 'מחוזק', '#bfdbfe', '#eff6ff', '#1d4ed8'],
                      ['commercial', 'מסחרי', '#fed7aa', '#fff7ed', '#c2410c'],
                    ] as const).map(([val, label, borderColor, bg, color]) => (
                      <button key={val} type="button" onClick={() => ntf('tire_type', val)} style={{
                        flex: 1, padding: '8px', fontSize: '13px', cursor: 'pointer', borderRadius: '8px',
                        border: `2px solid ${newTireForm.tire_type === val ? borderColor : '#e2e8f0'}`,
                        background: newTireForm.tire_type === val ? bg : '#fff',
                        color: newTireForm.tire_type === val ? color : '#64748b',
                        fontWeight: newTireForm.tire_type === val ? 700 : 400,
                      }}>{label}</button>
                    ))}
                  </div>
                </Field>
                <Field label="הערות"><input className="form-input" value={newTireForm.notes} onChange={e => ntf('notes', e.target.value)} /></Field>
                <div className="flex gap-3 mt-4">
                  <button onClick={createTire} disabled={savingNew || !newTireForm.width || !newTireForm.profile || !newTireForm.rim}
                    className="flex-1 bg-green-700 text-white rounded-xl font-bold disabled:opacity-40 active:brightness-90 transition-all" style={{ padding: '12px' }}>
                    {savingNew ? 'שומר...' : '✓ צור צמיג'}
                  </button>
                  <button onClick={() => setAction(null)} className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all" style={{ padding: '12px' }}>← חזרה</button>
                </div>
              </>
            )
          })()}
        </Modal>
      )}

      {/* ── EDIT MODAL ── */}
      {/* Edit modal — tires + products */}
      {editItem && (
        <Modal onClose={() => { setEditItem(null); refocus() }} width={460}>
          <div className="flex items-center gap-2 mb-4">{BADGE(editItem.type)}<span className="font-bold text-slate-700">עריכת {editItem.type === 'tire' ? 'צמיג' : 'מוצר'}</span></div>

          {editItem.type === 'tire' && <>
            <Field label="מותג"><input className="form-input" value={editForm.brand} onChange={e => setEF('brand', e.target.value)} placeholder="Michelin, Bridgestone..." /></Field>
            <Field label="מקט / ברקוד יצרן"><input className="form-input" value={editForm.sku} onChange={e => setEF('sku', e.target.value)} placeholder="סרוק או הקלד" style={{ fontFamily: 'monospace' }} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="אינדקס עומס">
                <input className="form-input" list="edit-load-opts" value={editForm.load_idx} onChange={e => setEF('load_idx', e.target.value)} placeholder="בחר או הקלד..." />
                <datalist id="edit-load-opts">
                  {LOAD_INDICES.map(v => <option key={v} value={v} />)}
                </datalist>
              </Field>
              <Field label="אינדקס מהירות">
                <input className="form-input" list="edit-speed-opts" value={editForm.speed_idx} onChange={e => setEF('speed_idx', e.target.value)} placeholder="בחר או הקלד..." />
                <datalist id="edit-speed-opts">
                  {SPEED_INDICES.map(v => <option key={v} value={v} />)}
                </datalist>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="כמות במלאי"><input className="form-input" type="number" min={0} value={editForm.qty} onChange={e => setEF('qty', e.target.value)} /></Field>
              <Field label="מיקום במחסן"><input className="form-input" value={editForm.location} onChange={e => setEF('location', e.target.value)} placeholder="מדף A3" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="מחיר קנייה (₪)"><input className="form-input" type="number" min={0} step={0.01} value={editForm.cost_price} onChange={e => setEF('cost_price', e.target.value)} /></Field>
              <Field label="מחיר מכירה (₪)"><input className="form-input" type="number" min={0} step={0.01} value={editForm.sell_price} onChange={e => setEF('sell_price', e.target.value)} /></Field>
            </div>
            <Field label="מצב הצמיג">
              <div className="flex gap-2">
                {(['new', 'used'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setEF('condition', c)} style={{
                    flex: 1, padding: '8px', border: `2px solid ${editForm.condition === c ? (c === 'used' ? '#f59e0b' : '#16a34a') : '#e2e8f0'}`,
                    borderRadius: '8px', cursor: 'pointer', fontWeight: editForm.condition === c ? 700 : 400, fontSize: '13px',
                    background: editForm.condition === c ? (c === 'used' ? '#fef3c7' : '#f0fdf4') : '#fff',
                    color: editForm.condition === c ? (c === 'used' ? '#92400e' : '#16a34a') : '#64748b',
                  }}>
                    {c === 'new' ? '✓ חדש' : '♻ משומש'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="סוג צמיג">
              <div className="flex gap-2">
                {([
                  ['regular',    'רגיל',  '#e2e8f0', '#fff',    '#64748b'],
                  ['reinforced', 'מחוזק', '#bfdbfe', '#eff6ff', '#1d4ed8'],
                  ['commercial', 'מסחרי', '#fed7aa', '#fff7ed', '#c2410c'],
                ] as const).map(([val, label, borderColor, bg, color]) => (
                  <button key={val} type="button" onClick={() => setEF('tire_type', val)} style={{
                    flex: 1, padding: '8px', fontSize: '13px', cursor: 'pointer', borderRadius: '8px',
                    border: `2px solid ${editForm.tire_type === val ? borderColor : '#e2e8f0'}`,
                    background: editForm.tire_type === val ? bg : '#fff',
                    color: editForm.tire_type === val ? color : '#64748b',
                    fontWeight: editForm.tire_type === val ? 700 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </Field>
            <Field label="הערות"><input className="form-input" value={editForm.notes} onChange={e => setEF('notes', e.target.value)} /></Field>
          </>}

          {editItem.type === 'product' && <>
            <Field label="שם מוצר"><input className="form-input" value={editForm.name} onChange={e => setEF('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="מק״ט"><input className="form-input" value={editForm.sku} onChange={e => setEF('sku', e.target.value)} placeholder="קוד פנימי" /></Field>
              <Field label="ברקוד"><input className="form-input" value={editForm.barcode} onChange={e => setEF('barcode', e.target.value)} placeholder="סרוק" style={{ fontFamily: 'monospace' }} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="קטגוריה"><input className="form-input" value={editForm.category} onChange={e => setEF('category', e.target.value)} /></Field>
              <Field label="יחידה"><input className="form-input" value={editForm.unit} onChange={e => setEF('unit', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="כמות במלאי"><input className="form-input" type="number" min={0} value={editForm.qty} onChange={e => setEF('qty', e.target.value)} /></Field>
              <Field label="מחיר קנייה (₪)"><input className="form-input" type="number" min={0} step={0.01} value={editForm.cost_price} onChange={e => setEF('cost_price', e.target.value)} /></Field>
            </div>
            <Field label="מחיר מכירה (₪)"><input className="form-input" type="number" min={0} step={0.01} value={editForm.sell_price} onChange={e => setEF('sell_price', e.target.value)} /></Field>
            <Field label="הערות"><input className="form-input" value={editForm.notes} onChange={e => setEF('notes', e.target.value)} /></Field>
          </>}

          <div className="flex gap-3 mt-5">
            <button onClick={saveEdit} disabled={saving} className="flex-1 bg-green-700 text-white rounded-xl font-bold disabled:opacity-50 active:brightness-90 transition-all" style={{ padding: '12px' }}>{saving ? 'שומר...' : 'שמור'}</button>
            <button onClick={() => { setEditItem(null); refocus() }} className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all" style={{ padding: '12px' }}>ביטול</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, width = 380 }: { children: React.ReactNode; onClose?: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-y-auto" style={{ width, maxWidth: '95vw', maxHeight: '90vh', padding: '28px 32px' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  )
}

const thSt: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }
const tdSt: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
