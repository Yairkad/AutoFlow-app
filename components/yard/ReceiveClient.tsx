'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/app/api/yard/search/route'

type Stage = 'scan' | 'found' | 'notfound' | 'saving'

const emptyTireForm = { brand: '', width: '', profile: '', rim: '', sell_price: '', cost_price: '' }
const emptyProdForm = { name: '', sell_price: '', cost_price: '' }

interface QuickEntry { item: SearchResult; count: number }

export default function ReceiveClient() {
  const router  = useRouter()
  const scanRef = useRef<HTMLInputElement>(null)
  const qtyRef  = useRef<HTMLInputElement>(null)

  // ── Normal mode ───────────────────────────────────────────────────────────
  const [stage,    setStage]    = useState<Stage>('scan')
  const [scanBuf,  setScanBuf]  = useState('')
  const [lastCode, setLastCode] = useState('')
  const [found,    setFound]    = useState<SearchResult | null>(null)
  const [qty,      setQty]      = useState(1)
  const [newType,  setNewType]  = useState<'tire' | 'product'>('tire')
  const [tireForm, setTireForm] = useState(emptyTireForm)
  const [prodForm, setProdForm] = useState(emptyProdForm)

  // ── Quick mode ────────────────────────────────────────────────────────────
  const [quickMode,       setQuickMode]       = useState(false)
  const quickMapRef = useRef<Record<string, QuickEntry>>({})
  const [quickEntries,    setQuickEntries]    = useState<QuickEntry[]>([])
  const [unknownQuick,    setUnknownQuick]    = useState<string[]>([])
  const [lastQuick,       setLastQuick]       = useState<string | null>(null)
  const [showQuickConfirm,setShowQuickConfirm]= useState(false)
  const [savingQuick,     setSavingQuick]     = useState(false)

  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }
  const refocus   = () => setTimeout(() => scanRef.current?.focus(), 80)

  // ── Focus ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'scan') refocus()
  }, [stage, quickMode])

  useEffect(() => {
    if (stage === 'found') setTimeout(() => qtyRef.current?.focus(), 100)
  }, [stage])

  // ── Debounce ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scanBuf.trim()) return
    if (stage !== 'scan') return
    const t = setTimeout(() => {
      const code = scanBuf.trim()
      setScanBuf('')
      if (quickMode) handleQuickScan(code)
      else handleScan(code)
    }, 200)
    return () => clearTimeout(t)
  }, [scanBuf, stage, quickMode]) // eslint-disable-line

  // ── Normal scan ───────────────────────────────────────────────────────────
  async function handleScan(code: string) {
    setLastCode(code)
    const res  = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const data: SearchResult | null = await res.json()
    if (data) {
      setFound(data); setQty(1); setStage('found')
    } else {
      setTireForm({ ...emptyTireForm }); setProdForm({ ...emptyProdForm })
      setQty(1); setNewType('tire'); setStage('notfound')
    }
  }

  async function confirmReceive() {
    if (!found) return
    setStage('saving')
    const res = await fetch('/api/yard/receive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: found.type, id: found.id, qty_add: qty }),
    })
    if (res.ok) {
      const { qty: newQty } = await res.json()
      showToast(`✓ ${found.name} — מלאי עודכן ל-${newQty}`)
      setFound(null); setStage('scan')
    } else { showToast('שגיאה — נסה שוב'); setStage('found') }
  }

  async function createAndReceive() {
    setStage('saving')
    const isNewTire = newType === 'tire'
    const payload   = isNewTire
      ? { type: 'tire', sku: lastCode, qty, brand: tireForm.brand.trim() || null,
          width: Number(tireForm.width) || null, profile: Number(tireForm.profile) || null,
          rim: Number(tireForm.rim) || null, sell_price: Number(tireForm.sell_price) || null,
          cost_price: Number(tireForm.cost_price) || null }
      : { type: 'product', sku: lastCode, qty, name: prodForm.name.trim() || 'פריט חדש',
          sell_price: Number(prodForm.sell_price) || null, cost_price: Number(prodForm.cost_price) || null,
          buy_price: Number(prodForm.cost_price) || null }
    const res = await fetch('/api/yard/receive', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (res.ok) { showToast(`✓ נוצר ונוסף למלאי (${qty} יח׳)`); setStage('scan') }
    else { showToast('שגיאה — נסה שוב'); setStage('notfound') }
  }

  // ── Quick scan ────────────────────────────────────────────────────────────
  async function handleQuickScan(code: string) {
    const res  = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const data: SearchResult | null = await res.json()
    if (!data) {
      setLastQuick(`❓ ${code}`)
      setUnknownQuick(p => p.includes(code) ? p : [...p, code])
      refocus(); return
    }
    const prev  = quickMapRef.current[data.id]
    const count = (prev?.count ?? 0) + 1
    quickMapRef.current[data.id] = { item: data, count }
    setQuickEntries(Object.values(quickMapRef.current))
    setLastQuick(data.name)
    refocus()
  }

  function startQuick() {
    quickMapRef.current = {}
    setQuickEntries([])
    setUnknownQuick([])
    setLastQuick(null)
    setQuickMode(true)
  }

  function cancelQuick() {
    setQuickMode(false)
    setShowQuickConfirm(false)
    refocus()
  }

  async function confirmQuick() {
    setSavingQuick(true)
    const entries = Object.values(quickMapRef.current)
    for (const e of entries) {
      await fetch('/api/yard/receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: e.item.type, id: e.item.id, qty_add: e.count }),
      })
    }
    setSavingQuick(false)
    setShowQuickConfirm(false)
    setQuickMode(false)
    showToast(`✓ קלטת ${entries.length} פריטים`)
    refocus()
  }

  const tf = (k: keyof typeof emptyTireForm, v: string) => setTireForm(f => ({ ...f, [k]: v }))
  const pf = (k: keyof typeof emptyProdForm, v: string) => setProdForm(f => ({ ...f, [k]: v }))

  const totalQuickUnits = quickEntries.reduce((s, e) => s + e.count, 0)

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white font-bold rounded-xl shadow-xl"
          style={{ padding: '12px 24px', fontSize: '15px', maxWidth: '90vw', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* Quick confirm overlay */}
      {showQuickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: 420, maxWidth: '95vw', maxHeight: '85vh', overflow: 'auto', padding: '24px 28px' }}>
            <p className="font-black text-slate-800 text-xl mb-1">אישור קליטה מהירה</p>
            <p className="text-slate-500 text-sm mb-4">{quickEntries.length} פריטים · {totalQuickUnits} יח׳ סה״כ</p>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
              {quickEntries.map((e, i) => (
                <div key={e.item.id} className="flex items-center justify-between"
                  style={{ padding: '10px 14px', borderBottom: i < quickEntries.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <span className="font-semibold text-slate-800 text-sm">{e.item.name}</span>
                  <span className="font-black text-green-700" style={{ fontSize: '18px' }}>+{e.count}</span>
                </div>
              ))}
            </div>
            {unknownQuick.length > 0 && (
              <p className="text-red-500 text-sm font-semibold mb-4">⚠ {unknownQuick.length} ברקודים לא זוהו ולא יקלטו</p>
            )}
            <div className="flex gap-3">
              <button onClick={confirmQuick} disabled={savingQuick}
                className="flex-1 bg-green-700 text-white rounded-xl font-bold disabled:opacity-50 active:brightness-90 transition-all"
                style={{ padding: '13px' }}>
                {savingQuick ? 'קולט...' : `✓ אשר קליטה`}
              </button>
              <button onClick={() => setShowQuickConfirm(false)}
                className="flex-1 border-2 border-slate-200 rounded-xl font-bold text-slate-600 active:bg-slate-50 transition-all"
                style={{ padding: '13px' }}>
                חזרה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0" style={{ padding: '14px 18px' }}>
        <h2 className="text-xl font-bold">📦 {quickMode ? 'סריקה מהירה' : 'קבלת סחורה'}</h2>
        <button onClick={() => quickMode ? cancelQuick() : router.back()}
          className="bg-white/10 rounded-lg font-semibold text-sm active:bg-white/20" style={{ padding: '6px 14px' }}>
          ← {quickMode ? 'ביטול' : 'חזור'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 14px' }}>

        {/* ── QUICK MODE ── */}
        {quickMode && (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            {/* Scan input */}
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl shadow-md mb-4" style={{ padding: '14px 18px' }}>
              <label className="block text-sm font-bold text-amber-700 mb-2">סורק — כל סריקה מוסיפה 1 אוטומטית</label>
              <input
                ref={scanRef}
                type="text" inputMode="none"
                value={scanBuf}
                onChange={e => setScanBuf(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) { setScanBuf(''); handleQuickScan(v) } } }}
                placeholder="פוקוס כאן וסרוק..."
                className="w-full border-2 border-amber-300 rounded-xl font-bold bg-white outline-none focus:border-amber-500 transition-colors"
                style={{ padding: '12px 16px', fontSize: '18px', letterSpacing: '3px', direction: 'ltr', textAlign: 'center' }}
                autoFocus
              />
              {lastQuick && <p className="text-sm font-semibold mt-2 text-amber-800">↳ {lastQuick}</p>}
            </div>

            {/* Running list */}
            {quickEntries.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden mb-4">
                <div className="bg-amber-50 border-b border-amber-200 flex items-center justify-between" style={{ padding: '10px 16px' }}>
                  <span className="font-bold text-amber-800">{quickEntries.length} פריטים · {totalQuickUnits} יח׳</span>
                  {unknownQuick.length > 0 && <span className="text-red-500 text-sm font-semibold">⚠ {unknownQuick.length} לא זוהו</span>}
                </div>
                {quickEntries.map((e, i) => (
                  <div key={e.item.id} className="flex items-center justify-between"
                    style={{ padding: '12px 16px', borderBottom: i < quickEntries.length - 1 ? '1px solid #fef3c7' : 'none', background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{e.item.name}</p>
                      <p className="text-slate-400 text-xs">מלאי נוכחי: {e.item.stock ?? 0}</p>
                    </div>
                    <span className="font-black text-amber-600" style={{ fontSize: '22px' }}>+{e.count}</span>
                  </div>
                ))}
              </div>
            )}

            {quickEntries.length === 0 && (
              <p className="text-center text-slate-400 py-10">עדיין לא נסרקו פריטים</p>
            )}

            <button onClick={() => setShowQuickConfirm(true)} disabled={quickEntries.length === 0}
              className="w-full bg-green-700 text-white font-bold rounded-2xl disabled:opacity-40 active:scale-[.98] transition-all"
              style={{ padding: '18px', fontSize: '17px' }}>
              ✓ סיים וקלוט הכל ({totalQuickUnits} יח׳)
            </button>
          </div>
        )}

        {/* ── NORMAL MODE ── */}
        {!quickMode && <>

          {/* STAGE: scan */}
          {stage === 'scan' && (
            <div className="flex flex-col gap-4" style={{ maxWidth: 480, margin: '0 auto', paddingTop: '16px' }}>
              {/* Mode toggle */}
              <div className="flex rounded-2xl overflow-hidden border-2 border-slate-200 bg-white">
                <button className="flex-1 font-bold transition-colors"
                  style={{ padding: '13px', background: '#1e293b', color: '#fff', fontSize: '14px' }}>
                  📋 אחד אחד
                </button>
                <button onClick={startQuick} className="flex-1 font-bold transition-colors active:brightness-90"
                  style={{ padding: '13px', background: '#fff', color: '#64748b', fontSize: '14px' }}>
                  ⚡ סריקה מהירה
                </button>
              </div>

              <input
                ref={scanRef}
                type="text" inputMode="none"
                value={scanBuf}
                onChange={e => setScanBuf(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) handleScan(v) } }}
                placeholder="הכנס פוקוס וסרוק..."
                className="w-full border-2 border-blue-400 rounded-2xl font-bold bg-blue-50 outline-none focus:border-blue-600 transition-colors"
                style={{ padding: '16px 18px', fontSize: '20px', letterSpacing: '3px', direction: 'ltr', textAlign: 'center' }}
                autoFocus
              />
              <p className="text-slate-400 text-sm text-center">הסורק מזהה אוטומטית · Enter לחיפוש ידני</p>
            </div>
          )}

          {/* STAGE: found */}
          {stage === 'found' && found && (
            <div className="flex flex-col gap-4" style={{ maxWidth: 480, margin: '0 auto' }}>
              <div className="bg-white rounded-2xl border-2 border-green-400 shadow" style={{ padding: '20px' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-900" style={{ fontSize: '18px' }}>{found.name}</div>
                    {found.sku && <div className="text-slate-400 font-mono text-sm mt-1">{found.sku}</div>}
                  </div>
                  <span className="bg-green-100 text-green-800 font-bold rounded-lg text-sm flex-shrink-0" style={{ padding: '4px 10px' }}>
                    {found.type === 'tire' ? '🏁 צמיג' : '📦 מוצר'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-slate-500 text-sm">מלאי נוכחי:</span>
                  <span className="font-bold text-slate-700">{found.stock ?? 0} יח׳</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow" style={{ padding: '20px' }}>
                <p className="font-bold text-slate-700 mb-3">כמה יחידות התקבלו?</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="bg-slate-100 rounded-xl font-black text-slate-600 active:bg-slate-200 transition-colors"
                    style={{ width: '52px', height: '52px', fontSize: '24px' }}>−</button>
                  <input ref={qtyRef} type="number" min="1" value={qty}
                    onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="flex-1 border-2 border-blue-400 rounded-xl text-center font-black text-slate-900 outline-none"
                    style={{ height: '52px', fontSize: '28px' }} />
                  <button onClick={() => setQty(q => q + 1)}
                    className="bg-slate-100 rounded-xl font-black text-green-600 active:bg-slate-200 transition-colors"
                    style={{ width: '52px', height: '52px', fontSize: '24px' }}>+</button>
                </div>
              </div>

              <button onClick={confirmReceive}
                className="w-full bg-green-700 text-white font-bold rounded-2xl active:scale-[.98] transition-all"
                style={{ padding: '18px', fontSize: '18px' }}>
                ✓ אשר קליטת {qty} יח׳
              </button>
              <button onClick={() => setStage('scan')}
                className="w-full bg-white border-2 border-slate-200 text-slate-500 font-semibold rounded-2xl active:bg-slate-50"
                style={{ padding: '14px', fontSize: '15px' }}>
                ← סרוק שוב
              </button>
            </div>
          )}

          {/* STAGE: notfound */}
          {stage === 'notfound' && (
            <div className="flex flex-col gap-4" style={{ maxWidth: 480, margin: '0 auto' }}>
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl" style={{ padding: '16px' }}>
                <p className="font-bold text-amber-800">ברקוד לא נמצא במערכת</p>
                <p className="font-mono text-amber-700 text-sm mt-1">{lastCode}</p>
              </div>

              <div className="flex rounded-xl overflow-hidden border-2 border-slate-200">
                {(['tire', 'product'] as const).map(t => (
                  <button key={t} onClick={() => setNewType(t)} className="flex-1 font-bold transition-colors"
                    style={{ padding: '12px', background: newType === t ? '#1e40af' : '#fff', color: newType === t ? '#fff' : '#64748b', fontSize: '15px' }}>
                    {t === 'tire' ? '🏁 צמיג' : '📦 מוצר'}
                  </button>
                ))}
              </div>

              {newType === 'tire' ? (
                <div className="bg-white rounded-2xl shadow flex flex-col gap-3" style={{ padding: '16px' }}>
                  <div><label className="text-xs font-bold text-slate-500 mb-1 block">מותג</label>
                    <input className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={tireForm.brand} onChange={e => tf('brand', e.target.value)} placeholder="Bridgestone..." style={{ padding: '10px 12px' }} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['width','profile','rim'] as const).map(f => (
                      <div key={f}><label className="text-xs font-bold text-slate-500 mb-1 block">{f === 'width' ? 'רוחב' : f === 'profile' ? 'פרופיל' : 'אינץ׳'}</label>
                        <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400 text-center font-bold"
                          value={tireForm[f]} onChange={e => tf(f, e.target.value)} placeholder={f === 'width' ? '195' : f === 'profile' ? '55' : '16'} style={{ padding: '10px 6px' }} /></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">מחיר מכירה</label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                        value={tireForm.sell_price} onChange={e => tf('sell_price', e.target.value)} placeholder="₪" style={{ padding: '10px 12px' }} /></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">מחיר קנייה</label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                        value={tireForm.cost_price} onChange={e => tf('cost_price', e.target.value)} placeholder="₪" style={{ padding: '10px 12px' }} /></div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow flex flex-col gap-3" style={{ padding: '16px' }}>
                  <div><label className="text-xs font-bold text-slate-500 mb-1 block">שם מוצר</label>
                    <input className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={prodForm.name} onChange={e => pf('name', e.target.value)} placeholder="שמן מנוע..." style={{ padding: '10px 12px' }} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">מחיר מכירה</label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                        value={prodForm.sell_price} onChange={e => pf('sell_price', e.target.value)} placeholder="₪" style={{ padding: '10px 12px' }} /></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">מחיר קנייה</label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                        value={prodForm.cost_price} onChange={e => pf('cost_price', e.target.value)} placeholder="₪" style={{ padding: '10px 12px' }} /></div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow flex items-center gap-3" style={{ padding: '16px' }}>
                <span className="font-bold text-slate-700 flex-shrink-0">כמות:</span>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="bg-slate-100 rounded-lg font-black text-slate-600 active:bg-slate-200" style={{ width: '40px', height: '40px', fontSize: '20px' }}>−</button>
                <span className="font-black text-slate-900 w-10 text-center" style={{ fontSize: '22px' }}>{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="bg-slate-100 rounded-lg font-black text-green-600 active:bg-slate-200" style={{ width: '40px', height: '40px', fontSize: '20px' }}>+</button>
              </div>

              <button onClick={createAndReceive}
                className="w-full bg-blue-700 text-white font-bold rounded-2xl active:scale-[.98] transition-all"
                style={{ padding: '18px', fontSize: '18px' }}>
                + צור וקלוט {qty} יח׳
              </button>
              <button onClick={() => setStage('scan')}
                className="w-full bg-white border-2 border-slate-200 text-slate-500 font-semibold rounded-2xl active:bg-slate-50"
                style={{ padding: '14px', fontSize: '15px' }}>
                ← סרוק שוב
              </button>
            </div>
          )}

          {stage === 'saving' && (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh', gap: '16px' }}>
              <div className="text-5xl">⏳</div>
              <p className="font-bold text-slate-600 text-lg">שומר...</p>
            </div>
          )}
        </>}

      </div>
    </div>
  )
}
