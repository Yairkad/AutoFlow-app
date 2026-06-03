'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface InventoryItem {
  id: string
  type: 'tire' | 'product'
  name: string
  sku: string | null
  barcode: string | null
  qty: number
}

type FoundItem = InventoryItem & { found: true }

type NotFoundAction = 'link' | 'create' | null

export default function ScanClient() {
  const router = useRouter()
  const sb = createClient()
  const scanRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [barcodeInput, setBarcodeInput]   = useState('')
  const [textFilter,   setTextFilter]     = useState('')
  const [items,        setItems]          = useState<InventoryItem[]>([])
  const [loading,      setLoading]        = useState(true)
  const [foundItem,    setFoundItem]      = useState<FoundItem | null>(null)
  const [notFoundCode, setNotFoundCode]   = useState<string | null>(null)
  const [action,       setAction]         = useState<NotFoundAction>(null)
  const [linkSearch,   setLinkSearch]     = useState('')
  const [savingLink,   setSavingLink]     = useState(false)
  const [toast,        setToast]          = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile) return

    const [{ data: tires }, { data: products }] = await Promise.all([
      sb.from('tires')
        .select('id,brand,width,profile,rim,sku,qty')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false }),
      sb.from('products')
        .select('id,name,sku,barcode,qty')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false }),
    ])

    const tireItems: InventoryItem[] = (tires ?? []).map(t => ({
      id:      t.id,
      type:    'tire',
      name:    `${t.brand ?? ''} ${t.width}/${t.profile}R${t.rim}`.trim(),
      sku:     t.sku ?? null,
      barcode: t.sku ?? null,
      qty:     t.qty,
    }))

    const prodItems: InventoryItem[] = (products ?? []).map(p => ({
      id:      p.id,
      type:    'product',
      name:    p.name,
      sku:     p.sku ?? null,
      barcode: p.barcode ?? null,
      qty:     p.qty,
    }))

    setItems([...tireItems, ...prodItems])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  // Auto-focus scan input
  useEffect(() => { scanRef.current?.focus() }, [])

  // Debounce barcode search (200ms — works with all scanner types)
  useEffect(() => {
    if (!barcodeInput.trim()) return
    const t = setTimeout(() => handleScan(barcodeInput.trim()), 200)
    return () => clearTimeout(t)
  }, [barcodeInput]) // eslint-disable-line

  function handleScan(code: string) {
    setBarcodeInput('')
    const match = items.find(
      i => (i.barcode && i.barcode === code) || (i.sku && i.sku === code)
    )
    if (match) {
      setFoundItem({ ...match, found: true })
      setNotFoundCode(null)
      setAction(null)
    } else {
      setFoundItem(null)
      setNotFoundCode(code)
      setAction(null)
      setLinkSearch('')
    }
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  async function saveBarcode(item: InventoryItem, code: string) {
    setSavingLink(true)
    if (item.type === 'tire') {
      await sb.from('tires').update({ sku: code }).eq('id', item.id)
    } else {
      await sb.from('products').update({ barcode: code }).eq('id', item.id)
    }
    setSavingLink(false)
    setNotFoundCode(null)
    setAction(null)
    showToast(`ברקוד שויך ל-${item.name} ✓`)
    await load()
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  function closeModal() {
    setFoundItem(null)
    setNotFoundCode(null)
    setAction(null)
    setTimeout(() => scanRef.current?.focus(), 100)
  }

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

  const BARCODE_ICON = (
    <svg viewBox="0 0 28 22" width="22" height="17" fill="currentColor">
      <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
      <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
      <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
      <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
    </svg>
  )

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white font-bold rounded-xl px-6 py-3 shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="text-slate-700">{BARCODE_ICON}</div>
        <h1 className="text-2xl font-black text-slate-800">סריקת ברקוד</h1>
      </div>

      {/* Scan input */}
      <div className="bg-white border-2 border-blue-400 rounded-2xl shadow-md mb-6" style={{ padding: '16px 20px' }}>
        <label className="block text-sm font-bold text-blue-700 mb-2">סרוק ברקוד</label>
        <input
          ref={scanRef}
          type="text"
          inputMode="none"
          value={barcodeInput}
          onChange={e => setBarcodeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) handleScan(v) } }}
          placeholder="הכנס פוקוס כאן וסרוק..."
          className="w-full border-2 border-slate-200 rounded-xl font-bold bg-blue-50 outline-none focus:border-blue-500 transition-colors"
          style={{ padding: '12px 16px', fontSize: '18px', letterSpacing: '3px', direction: 'ltr' }}
        />
        <p className="text-xs text-slate-400 mt-2">הסורק ימצא אוטומטית · אפשר גם להקליד ולחוץ Enter</p>
      </div>

      {/* Inventory list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100" style={{ padding: '14px 18px' }}>
          <span className="font-bold text-slate-700">מלאי ({items.length} פריטים)</span>
          <input
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
            placeholder="סנן לפי שם / מק״ט / ברקוד..."
            className="border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-blue-400 transition-colors"
            style={{ padding: '6px 12px', fontSize: '13px', width: '220px' }}
          />
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-10">טוען...</div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '55vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={thSt}>סוג</th>
                  <th style={thSt}>מק״ט</th>
                  <th style={thSt}>ברקוד</th>
                  <th style={{ ...thSt, flex: 1 }}>פריט</th>
                  <th style={{ ...thSt, textAlign: 'center' }}>כמות</th>
                  <th style={thSt}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id}
                    style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={tdSt}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                        background: item.type === 'tire' ? '#1e293b' : '#fff7ed',
                        color: item.type === 'tire' ? '#fff' : '#c2410c',
                        border: item.type === 'product' ? '1px solid #fed7aa' : 'none',
                      }}>
                        {item.type === 'tire' ? 'צמיג' : 'מוצר'}
                      </span>
                    </td>
                    <td style={{ ...tdSt, fontFamily: 'monospace', color: '#64748b' }}>{item.sku || '—'}</td>
                    <td style={{ ...tdSt, fontFamily: 'monospace', color: '#64748b' }}>{item.barcode && item.barcode !== item.sku ? item.barcode : (item.type === 'product' ? (item.barcode || '—') : '—')}</td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{item.name}</td>
                    <td style={{ ...tdSt, textAlign: 'center', fontWeight: 700,
                      color: item.qty === 0 ? '#ef4444' : item.qty <= 2 ? '#f59e0b' : '#16a34a' }}>
                      {item.qty}
                    </td>
                    <td style={tdSt}>
                      <button
                        onClick={() => router.push(item.type === 'tire' ? '/tires' : '/products')}
                        className="text-blue-600 font-bold hover:underline"
                        style={{ fontSize: '12px' }}
                      >
                        ערוך ←
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>אין תוצאות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── FOUND MODAL ── */}
      {foundItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: 360, padding: '28px 32px' }}>
            <div className="flex items-center gap-2 mb-4">
              <span style={{
                fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
                background: foundItem.type === 'tire' ? '#1e293b' : '#fff7ed',
                color: foundItem.type === 'tire' ? '#fff' : '#c2410c',
              }}>
                {foundItem.type === 'tire' ? 'צמיג' : 'מוצר'}
              </span>
              <span className="text-green-600 font-bold text-sm">✓ נמצא</span>
            </div>
            <p className="font-black text-slate-800 text-xl mb-1">{foundItem.name}</p>
            {foundItem.sku && <p className="text-slate-400 text-sm mb-1">מק״ט: {foundItem.sku}</p>}
            <p className="text-slate-500 text-sm mb-5">
              כמות במלאי:&nbsp;
              <span style={{ fontWeight: 700, color: foundItem.qty === 0 ? '#ef4444' : '#16a34a' }}>
                {foundItem.qty}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(foundItem.type === 'tire' ? '/tires' : '/products')}
                className="flex-1 bg-blue-600 text-white rounded-xl font-bold active:brightness-90 transition-all"
                style={{ padding: '11px' }}
              >
                עבור לעריכה ←
              </button>
              <button
                onClick={closeModal}
                className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all"
                style={{ padding: '11px' }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOT FOUND MODAL ── */}
      {notFoundCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: action === 'link' ? 480 : 380, padding: '28px 32px' }}>

            {action === null && (
              <>
                <p className="font-bold text-slate-500 text-sm mb-1">ברקוד:</p>
                <p className="font-black text-slate-800 text-lg mb-1" style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>{notFoundCode}</p>
                <p className="text-red-500 font-semibold text-sm mb-6">לא נמצא במלאי</p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setAction('link')}
                    className="w-full bg-blue-600 text-white rounded-xl font-bold active:brightness-90 transition-all"
                    style={{ padding: '13px' }}
                  >
                    שייך לפריט קיים
                  </button>
                  <button
                    onClick={() => { closeModal(); router.push('/tires') }}
                    className="w-full bg-slate-800 text-white rounded-xl font-bold active:brightness-90 transition-all"
                    style={{ padding: '13px' }}
                  >
                    הקם צמיג חדש ←
                  </button>
                  <button
                    onClick={() => { closeModal(); router.push('/products') }}
                    className="w-full bg-orange-500 text-white rounded-xl font-bold active:brightness-90 transition-all"
                    style={{ padding: '13px' }}
                  >
                    הקם מוצר חדש ←
                  </button>
                  <button onClick={closeModal} className="text-slate-400 text-sm font-semibold mt-1 hover:text-slate-600">
                    ביטול
                  </button>
                </div>
              </>
            )}

            {action === 'link' && (
              <>
                <p className="font-bold text-slate-700 mb-1">שייך ברקוד <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: '6px' }}>{notFoundCode}</span> לפריט:</p>
                <input
                  ref={searchRef}
                  autoFocus
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="חפש לפי שם או מק״ט..."
                  className="w-full border-2 border-blue-300 rounded-xl outline-none focus:border-blue-500 transition-colors mt-3 mb-3"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                />
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  {linkFiltered.map(item => (
                    <button
                      key={item.id}
                      disabled={savingLink}
                      onClick={() => saveBarcode(item, notFoundCode!)}
                      className="w-full flex items-center justify-between active:bg-blue-50 transition-colors disabled:opacity-50"
                      style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}
                    >
                      <div className="text-right">
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                        {item.sku && <p className="text-slate-400 text-xs">{item.sku}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                          background: item.type === 'tire' ? '#1e293b' : '#fff7ed',
                          color: item.type === 'tire' ? '#fff' : '#c2410c',
                        }}>
                          {item.type === 'tire' ? 'צמיג' : 'מוצר'}
                        </span>
                        <span className="text-blue-600 font-bold text-sm">שייך ←</span>
                      </div>
                    </button>
                  ))}
                  {linkFiltered.length === 0 && (
                    <p className="text-center text-slate-400 py-6 text-sm">לא נמצאו פריטים</p>
                  )}
                </div>
                <button onClick={() => setAction(null)} className="text-slate-400 text-sm font-semibold mt-3 hover:text-slate-600">
                  ← חזרה
                </button>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

const thSt: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }
const tdSt: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
