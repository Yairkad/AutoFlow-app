'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'
import { formatPlate } from '@/lib/yard/types'

type VehicleInfo = { make?: string; model?: string; year?: number } | null

export default function NewCarClient() {
  const router = useRouter()
  const [digits, setDigits]     = useState('')
  const [vehicle, setVehicle]   = useState<VehicleInfo>(null)
  const [loading, setLoading]   = useState(false)
  const [saving,  setSaving]    = useState(false)
  const [error,   setError]     = useState<string | null>(null)

  const plate = formatPlate(digits)

  const lookup = useCallback(async (d: string) => {
    if (d.length < 7) { setVehicle(null); return }
    setLoading(true)
    const data = await fetchVehicleByPlate(d)
    setLoading(false)
    setVehicle(data ? { make: data.make, model: data.model, year: data.year } : null)
  }, [])

  function press(k: string) {
    if (k === 'del') {
      const next = digits.slice(0, -1)
      setDigits(next)
      lookup(next)
      return
    }
    if (digits.length >= 8) return
    const next = digits + k
    setDigits(next)
    lookup(next)
  }

  async function confirm() {
    if (digits.length < 7) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/yard/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate:  digits,
          make:   vehicle?.make  ?? null,
          model:  vehicle?.model ?? null,
          year:   vehicle?.year  ? String(vehicle.year) : null,
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

  const vehicleLabel = vehicle
    ? `${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.year ?? ''}`.trim()
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-3 flex-shrink-0">
        <h2 className="text-lg font-bold">קליטת רכב חדש</h2>
      </div>

      {/* Plate display */}
      <div className="px-4 pt-5 pb-1 flex-shrink-0">
        <div className={`
          w-full border-[3px] rounded-xl py-4 text-center font-black text-3xl tracking-[6px] bg-white
          ${digits.length > 0 ? 'border-red-500 text-slate-900' : 'border-red-300 text-slate-300'}
        `}>
          {plate || 'הזן מס׳ רכב'}
        </div>
      </div>

      {/* Vehicle detected */}
      <div className="px-4 pb-1 min-h-[40px] flex-shrink-0">
        {loading && (
          <div className="text-sm text-slate-400 text-center py-1">מחפש...</div>
        )}
        {!loading && vehicleLabel && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-800 text-sm font-semibold flex items-center gap-2">
            <span className="text-base">✓</span> {vehicleLabel} — זוהה אוטומטית
          </div>
        )}
        {!loading && digits.length >= 7 && !vehicle && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800 text-sm flex items-center gap-2">
            <span>⚠</span> לא נמצא — ניתן להמשיך ללא פרטי רכב
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">{error}</div>
        )}
      </div>

      {/* Numpad */}
      <div className="flex-1 px-4 pb-2">
        <div className="grid grid-cols-3 gap-3 h-full">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button
              key={k}
              onPointerDown={() => press(k)}
              className="bg-white border-2 border-slate-200 rounded-2xl text-3xl font-bold text-slate-800 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
            >{k}</button>
          ))}
          <button
            onPointerDown={() => press('del')}
            className="bg-white border-2 border-slate-200 rounded-2xl text-2xl font-bold text-red-500 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
          >⌫</button>
          <button
            onPointerDown={() => press('0')}
            className="bg-white border-2 border-slate-200 rounded-2xl text-3xl font-bold text-slate-800 shadow-sm active:scale-95 active:bg-slate-100 transition-all"
          >0</button>
          <button
            onPointerDown={confirm}
            disabled={digits.length < 7 || saving}
            className="bg-green-700 border-2 border-green-700 rounded-2xl text-xl font-bold text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >{saving ? '...' : '✓ אישור'}</button>
        </div>
      </div>

      {/* Back button */}
      <div className="px-4 pb-4 flex-shrink-0">
        <button
          onClick={() => router.push('/yard')}
          className="w-full bg-slate-800 text-white rounded-xl py-4 text-base font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
        >🏠 חזור לרחבה הראשית</button>
      </div>
    </div>
  )
}
