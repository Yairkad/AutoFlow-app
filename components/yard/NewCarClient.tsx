'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatPlate } from '@/lib/yard/types'

type VehicleInfo = { make?: string; model?: string; year?: number } | null

export default function NewCarClient() {
  const router = useRouter()
  const [digits, setDigits]   = useState('')
  const [vehicle, setVehicle] = useState<VehicleInfo>(null)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const plate = formatPlate(digits)

  const lookup = useCallback(async (d: string) => {
    if (d.length < 7) { setVehicle(null); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/public/plate?plate=${encodeURIComponent(d)}`)
      const data = await res.json()
      setVehicle(data ? { make: data.make, model: data.model, year: data.year } : null)
    } catch {
      setVehicle(null)
    } finally {
      setLoading(false)
    }
  }, [])

  function press(k: string) {
    if (k === 'del') { const n = digits.slice(0,-1); setDigits(n); lookup(n); return }
    if (digits.length >= 8) return
    const n = digits + k; setDigits(n); lookup(n)
  }

  async function confirm() {
    if (digits.length < 7) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/yard/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: digits,
          make:  vehicle?.make  ?? null,
          model: vehicle?.model ?? null,
          year:  vehicle?.year  ? String(vehicle.year) : null,
        }),
      })
      if (!res.ok) throw new Error('שגיאה ביצירת כרטיס')
      const session = await res.json()
      router.push(`/yard/${session.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {/* Header */}
      <div className="bg-slate-800 text-white flex-shrink-0" style={{ padding: '14px 18px' }}>
        <h2 className="text-xl font-bold">קליטת רכב חדש</h2>
      </div>

      {/* Plate display */}
      <div style={{ margin: '14px 14px 0' }} className="flex-shrink-0">
        <div className={`bg-white border-[3px] rounded-xl text-center font-black text-3xl tracking-[6px] ${digits.length > 0 ? 'border-red-500 text-slate-900' : 'border-red-300 text-slate-300'}`}
          style={{ padding: '16px 20px' }}>
          {plate || 'הזן מס׳ רכב'}
        </div>
      </div>

      {/* Vehicle detected */}
      <div style={{ margin: '10px 14px 0', minHeight: '40px' }} className="flex-shrink-0">
        {loading && <div className="text-sm text-slate-400 text-center py-1">מחפש...</div>}
        {!loading && vehicle && (
          <div className="bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-semibold flex items-center gap-2" style={{ padding: '10px 14px' }}>
            <span>✓</span>
            <span>{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')} — זוהה אוטומטית</span>
          </div>
        )}
        {!loading && digits.length >= 7 && !vehicle && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-center gap-2" style={{ padding: '10px 14px' }}>
            <span>⚠</span> לא נמצא — ניתן להמשיך ללא פרטי רכב
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" style={{ padding: '10px 14px' }}>{error}</div>}
      </div>

      {/* Numpad */}
      <div className="flex-1" style={{ padding: '10px 14px' }}>
        <div className="grid grid-cols-3 h-full" dir="ltr" style={{ gap: '10px' }}>
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} onPointerDown={() => press(k)}
              className="bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-800 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
              style={{ fontSize: '28px' }}>{k}</button>
          ))}
          <button onPointerDown={() => press('del')}
            className="bg-white border-2 border-slate-200 rounded-2xl font-bold text-red-500 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
            style={{ fontSize: '22px' }}>⌫</button>
          <button onPointerDown={() => press('0')}
            className="bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-800 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
            style={{ fontSize: '28px' }}>0</button>
          <button onPointerDown={confirm} disabled={digits.length < 7 || saving || loading}
            className="bg-green-700 border-2 border-green-700 rounded-2xl font-bold text-white shadow-sm active:scale-95 disabled:opacity-40 transition-all"
            style={{ fontSize: '20px' }}>{saving ? '...' : '✓ אישור'}</button>
        </div>
      </div>

      {/* Back button */}
      <div style={{ padding: '0 14px 14px' }} className="flex-shrink-0">
        <button onClick={() => router.push('/yard')}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-2 rounded-xl transition-all"
          style={{ minHeight: '52px', fontSize: '16px' }}>
          🏠 חזור לרחבה הראשית
        </button>
      </div>
    </div>
  )
}
