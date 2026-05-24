'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/app/api/yard/search/route'
import CameraScanner from '@/components/yard/CameraScanner'

type Stage = 'scan' | 'found' | 'notfound' | 'saving' | 'done'

const emptyTireForm = { brand: '', width: '', profile: '', rim: '', sell_price: '', cost_price: '' }
const emptyProdForm = { name: '', sell_price: '', cost_price: '' }

export default function ReceiveClient() {
  const router     = useRouter()
  const scanRef    = useRef<HTMLInputElement>(null)
  const qtyRef     = useRef<HTMLInputElement>(null)

  const [stage,      setStage]      = useState<Stage>('scan')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanBuf,   setScanBuf]   = useState('')
  const [lastCode,  setLastCode]  = useState('')
  const [found,     setFound]     = useState<SearchResult | null>(null)
  const [qty,       setQty]       = useState(1)
  const [newType,   setNewType]   = useState<'tire' | 'product'>('tire')
  const [tireForm,  setTireForm]  = useState(emptyTireForm)
  const [prodForm,  setProdForm]  = useState(emptyProdForm)
  const [toast,     setToast]     = useState<string | null>(null)

  // Keep scan input focused when in scan stage
  useEffect(() => {
    if (stage === 'scan') scanRef.current?.focus()
  }, [stage])

  // Auto-focus qty when item found
  useEffect(() => {
    if (stage === 'found') setTimeout(() => qtyRef.current?.focus(), 100)
  }, [stage])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleScan(code: string) {
    if (!code.trim()) return
    setLastCode(code)
    const res  = await fetch(`/api/yard/barcode?code=${encodeURIComponent(code)}`)
    const data: SearchResult | null = await res.json()
    if (data) {
      setFound(data)
      setQty(1)
      setStage('found')
    } else {
      setTireForm({ ...emptyTireForm })
      setProdForm({ ...emptyProdForm })
      setQty(1)
      setNewType('tire')
      setStage('notfound')
    }
    setScanBuf('')
  }

  async function confirmReceive() {
    if (!found) return
    setStage('saving')
    const res = await fetch('/api/yard/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: found.type, id: found.id, qty_add: qty }),
    })
    if (res.ok) {
      const { qty: newQty } = await res.json()
      showToast(`✓ ${found.name} — מלאי עודכן ל-${newQty}`)
      setFound(null)
      setStage('scan')
    } else {
      showToast('שגיאה בעדכון — נסה שוב')
      setStage('found')
    }
  }

  async function createAndReceive() {
    setStage('saving')
    const isNewTire = newType === 'tire'
    const payload   = isNewTire
      ? { type: 'tire', sku: lastCode, qty,
          brand:      tireForm.brand.trim()   || null,
          width:      Number(tireForm.width)  || null,
          profile:    Number(tireForm.profile)|| null,
          rim:        Number(tireForm.rim)    || null,
          sell_price: Number(tireForm.sell_price) || null,
          cost_price: Number(tireForm.cost_price) || null,
        }
      : { type: 'product', sku: lastCode, qty,
          name:       prodForm.name.trim()     || 'פריט חדש',
          sell_price: Number(prodForm.sell_price) || null,
          cost_price: Number(prodForm.cost_price) || null,
          buy_price:  Number(prodForm.cost_price) || null,
        }

    const res = await fetch('/api/yard/receive', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      showToast(`✓ נוצר ונוסף למלאי (${qty} יח׳)`)
      setStage('scan')
    } else {
      showToast('שגיאה ביצירה — נסה שוב')
      setStage('notfound')
    }
  }

  function tf(k: keyof typeof emptyTireForm, v: string) { setTireForm(f => ({ ...f, [k]: v })) }
  function pf(k: keyof typeof emptyProdForm, v: string) { setProdForm(f => ({ ...f, [k]: v })) }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {cameraOpen && (
        <CameraScanner
          onScan={code => { setCameraOpen(false); handleScan(code) }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white font-bold rounded-xl shadow-xl"
          style={{ padding: '12px 24px', fontSize: '15px', maxWidth: '90vw', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0"
        style={{ padding: '14px 18px' }}>
        <h2 className="text-xl font-bold">📦 קבלת סחורה</h2>
        <button onClick={() => router.push('/yard')}
          className="bg-white/10 rounded-lg font-semibold text-sm active:bg-white/20"
          style={{ padding: '6px 14px' }}>
          ← חזור
        </button>
      </div>

      {/* Hidden scan input — always capturing */}
      <input
        ref={scanRef}
        className="absolute opacity-0 w-0 h-0"
        value={scanBuf}
        onChange={e => setScanBuf(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && scanBuf.trim()) handleScan(scanBuf.trim()) }}
        onBlur={() => { if (stage === 'scan') setTimeout(() => scanRef.current?.focus(), 50) }}
      />

      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 14px' }}>

        {/* ── STAGE: scan ── */}
        {stage === 'scan' && (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh', gap: '20px' }}>
            <svg viewBox="0 0 56 44" width="80" height="62" fill="#334155">
              <rect x="0"  y="0" width="4" height="44"/><rect x="8"  y="0" width="2" height="44"/>
              <rect x="13" y="0" width="6" height="44"/><rect x="23" y="0" width="2" height="44"/>
              <rect x="29" y="0" width="4" height="44"/><rect x="37" y="0" width="2" height="44"/>
              <rect x="43" y="0" width="6" height="44"/><rect x="53" y="0" width="2" height="44"/>
            </svg>
            <p className="font-bold text-slate-700 text-center" style={{ fontSize: '20px' }}>
              סרוק ברקוד לקליטה
            </p>
            <p className="text-slate-400 text-sm text-center">
              הסורק פעיל — כוון לברקוד על הקופסה / הצמיג
            </p>
            <button
              onClick={() => setCameraOpen(true)}
              className="bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition-all"
              style={{ padding: '14px 32px', fontSize: '16px' }}>
              📷 סרוק עם מצלמה
            </button>
            <button
              onClick={() => scanRef.current?.focus()}
              className="bg-slate-600 text-white font-semibold rounded-xl active:scale-95 transition-all"
              style={{ padding: '10px 24px', fontSize: '14px' }}>
              🔌 סורק חיצוני
            </button>
          </div>
        )}

        {/* ── STAGE: found ── */}
        {stage === 'found' && found && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border-2 border-green-400 shadow" style={{ padding: '20px' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-black text-slate-900" style={{ fontSize: '18px' }}>{found.name}</div>
                  {found.sku && <div className="text-slate-400 font-mono text-sm mt-1">{found.sku}</div>}
                </div>
                <span className="bg-green-100 text-green-800 font-bold rounded-lg text-sm flex-shrink-0"
                  style={{ padding: '4px 10px' }}>
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
                <input
                  ref={qtyRef}
                  type="number" min="1"
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="flex-1 border-2 border-blue-400 rounded-xl text-center font-black text-slate-900 outline-none"
                  style={{ height: '52px', fontSize: '28px' }}
                />
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

        {/* ── STAGE: notfound ── */}
        {stage === 'notfound' && (
          <div className="flex flex-col gap-4">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl" style={{ padding: '16px' }}>
              <p className="font-bold text-amber-800">ברקוד לא נמצא במערכת</p>
              <p className="font-mono text-amber-700 text-sm mt-1">{lastCode}</p>
            </div>

            {/* Type toggle */}
            <div className="flex rounded-xl overflow-hidden border-2 border-slate-200">
              {(['tire', 'product'] as const).map(t => (
                <button key={t} onClick={() => setNewType(t)}
                  className="flex-1 font-bold transition-colors"
                  style={{
                    padding: '12px',
                    background: newType === t ? '#1e40af' : '#fff',
                    color:      newType === t ? '#fff'    : '#64748b',
                    fontSize:   '15px',
                  }}>
                  {t === 'tire' ? '🏁 צמיג' : '📦 מוצר'}
                </button>
              ))}
            </div>

            {newType === 'tire' ? (
              <div className="bg-white rounded-2xl shadow flex flex-col gap-3" style={{ padding: '16px' }}>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">ברקוד</label>
                  <input className="w-full border-2 border-slate-200 rounded-xl font-mono bg-slate-50 text-slate-400"
                    value={lastCode} readOnly style={{ padding: '10px 12px' }} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">מותג</label>
                  <input className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                    value={tireForm.brand} onChange={e => tf('brand', e.target.value)}
                    placeholder="Bridgestone, Michelin..." style={{ padding: '10px 12px' }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['width','profile','rim'] as const).map(f => (
                    <div key={f}>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">
                        {f === 'width' ? 'רוחב' : f === 'profile' ? 'פרופיל' : 'אינץ׳'}
                      </label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400 text-center font-bold"
                        value={tireForm[f]} onChange={e => tf(f, e.target.value)}
                        placeholder={f === 'width' ? '195' : f === 'profile' ? '55' : '16'}
                        style={{ padding: '10px 6px' }} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">מחיר מכירה</label>
                    <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={tireForm.sell_price} onChange={e => tf('sell_price', e.target.value)}
                      placeholder="₪" style={{ padding: '10px 12px' }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">מחיר קנייה</label>
                    <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={tireForm.cost_price} onChange={e => tf('cost_price', e.target.value)}
                      placeholder="₪" style={{ padding: '10px 12px' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow flex flex-col gap-3" style={{ padding: '16px' }}>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">ברקוד</label>
                  <input className="w-full border-2 border-slate-200 rounded-xl font-mono bg-slate-50 text-slate-400"
                    value={lastCode} readOnly style={{ padding: '10px 12px' }} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">שם מוצר</label>
                  <input className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                    value={prodForm.name} onChange={e => pf('name', e.target.value)}
                    placeholder="שמן מנוע, מסנן..." style={{ padding: '10px 12px' }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">מחיר מכירה</label>
                    <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={prodForm.sell_price} onChange={e => pf('sell_price', e.target.value)}
                      placeholder="₪" style={{ padding: '10px 12px' }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">מחיר קנייה</label>
                    <input type="number" className="w-full border-2 border-slate-200 rounded-xl outline-none focus:border-blue-400"
                      value={prodForm.cost_price} onChange={e => pf('cost_price', e.target.value)}
                      placeholder="₪" style={{ padding: '10px 12px' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Qty */}
            <div className="bg-white rounded-2xl shadow flex items-center gap-3" style={{ padding: '16px' }}>
              <span className="font-bold text-slate-700 flex-shrink-0">כמות שהתקבלה:</span>
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="bg-slate-100 rounded-lg font-black text-slate-600 active:bg-slate-200"
                style={{ width: '40px', height: '40px', fontSize: '20px' }}>−</button>
              <span className="font-black text-slate-900 w-10 text-center" style={{ fontSize: '22px' }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="bg-slate-100 rounded-lg font-black text-green-600 active:bg-slate-200"
                style={{ width: '40px', height: '40px', fontSize: '20px' }}>+</button>
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

        {/* ── STAGE: saving ── */}
        {stage === 'saving' && (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh', gap: '16px' }}>
            <div className="text-5xl">⏳</div>
            <p className="font-bold text-slate-600 text-lg">שומר...</p>
          </div>
        )}

      </div>
    </div>
  )
}
