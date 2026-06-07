'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

const LOAD_INDICES = ['60','62','65','67','69','71','73','75','77','80','82','84','85','86','87','88','89','90','91','92','93','94','95','96','98','99','100','101','102','103','104','105','106','107','108','109','110','112','114','116','118','120','121','122','124','126']
const SPEED_INDICES = ['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','Y','ZR','Z']

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
  // products
  name: string; barcode: string; category: string; unit: string
}

interface CountEntry {
  item: InventoryItem
  counted: number
}

type NotFoundAction = 'link' | null
type Mode = 'scan' | 'count'

export default function ScanClient() {
  const sb = createClient()
  const router = useRouter()
  const isMobile = useIsMobile()
  const scanRef   = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const modeRef   = useRef<Mode>('scan')
  const countMapRef = useRef<Record<string, CountEntry>>({})

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

  // edit
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ sku: '', qty: '', sell_price: '', cost_price: '', notes: '', brand: '', load_idx: '', speed_idx: '', location: '', name: '', barcode: '', category: '', unit: 'יח׳' })
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
  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile) return
    const [{ data: tires }, { data: products }] = await Promise.all([
      sb.from('tires').select('id,brand,width,profile,rim,sku,qty').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false }),
      sb.from('products').select('id,name,sku,barcode,qty').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false }),
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

  useEffect(() => { load() }, [load])
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
    await load()
    refocus()
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  async function openEdit(item: InventoryItem) {
    setFoundItem(null); setNotFoundCode(null)
    if (item.type === 'tire') {
      const { data } = await sb.from('tires').select('brand,width,profile,rim,sku,qty,sell_price,cost_price,load_idx,speed_idx,location,notes').eq('id', item.id).single()
      setEditForm({
        brand: data?.brand ?? '', sku: data?.sku ?? '', barcode: '',
        load_idx: data?.load_idx ?? '', speed_idx: data?.speed_idx ?? '',
        qty: String(data?.qty ?? 0), sell_price: String(data?.sell_price ?? ''),
        cost_price: String(data?.cost_price ?? ''), location: data?.location ?? '',
        notes: data?.notes ?? '', name: '', category: '', unit: 'יח׳',
      })
    } else {
      const { data } = await sb.from('products').select('name,sku,barcode,qty,sell_price,buy_price,category,unit,notes').eq('id', item.id).single()
      setEditForm({
        name: data?.name ?? '', sku: data?.sku ?? '', barcode: data?.barcode ?? '',
        category: data?.category ?? '', unit: data?.unit ?? 'יח׳',
        qty: String(data?.qty ?? 0), sell_price: String(data?.sell_price ?? ''),
        cost_price: String(data?.buy_price ?? ''), notes: data?.notes ?? '',
        brand: '', load_idx: '', speed_idx: '', location: '',
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
    setSaving(false); setEditItem(null); showToast('נשמר ✓'); await load(); refocus()
  }

  // ── Link barcode ──────────────────────────────────────────────────────────
  async function saveBarcode(item: InventoryItem, code: string) {
    setSavingLink(true)
    if (item.type === 'tire') await sb.from('tires').update({ sku: code }).eq('id', item.id)
    else await sb.from('products').update({ barcode: code }).eq('id', item.id)
    setSavingLink(false); setNotFoundCode(null); setAction(null)
    showToast(`ברקוד שויך ל-${item.name} ✓`); await load(); refocus()
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
        <Modal onClose={closeModal} width={action === 'link' ? 500 : 380}>
          {action === null && (
            <>
              <p className="font-bold text-slate-500 text-sm mb-1">ברקוד:</p>
              <p className="font-black text-slate-800 text-lg mb-1" style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>{notFoundCode}</p>
              <p className="text-red-500 font-semibold text-sm mb-6">לא נמצא במלאי</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => setAction('link')} className="w-full bg-blue-600 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '13px' }}>שייך לפריט קיים</button>
                <button onClick={() => { closeModal(); window.location.href = '/tires' }} className="w-full bg-slate-800 text-white rounded-xl font-bold active:brightness-90 transition-all" style={{ padding: '13px' }}>הקם צמיג חדש ←</button>
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
                <select className="form-input" value={editForm.load_idx} onChange={e => setEF('load_idx', e.target.value)}>
                  <option value="">— ללא —</option>
                  {LOAD_INDICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="אינדקס מהירות">
                <select className="form-input" value={editForm.speed_idx} onChange={e => setEF('speed_idx', e.target.value)}>
                  <option value="">— ללא —</option>
                  {SPEED_INDICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
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
