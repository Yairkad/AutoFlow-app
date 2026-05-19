'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession } from '@/lib/yard/types'
import { minutesSince, sessionTotal, formatPlate } from '@/lib/yard/types'

interface Props { initialSessions: YardSession[] }

export default function YardDashboard({ initialSessions }: Props) {
  const router  = useRouter()
  const [sessions, setSessions] = useState<YardSession[]>(initialSessions)
  const [, setTick] = useState(0)
  const [newCarLoading, setNewCarLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('yard-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_sessions' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_session_items' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line

  function timerState(openedAt: string): 'ok' | 'warn' | 'critical' {
    const m = minutesSince(openedAt)
    if (m > 45) return 'critical'
    if (m > 30) return 'warn'
    return 'ok'
  }

  const cardBorder: Record<string, string> = {
    ok:       'border-slate-200',
    warn:     'border-red-500',
    critical: 'border-red-500 animate-[flash_1.1s_ease-in-out_infinite]',
  }

  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>

      {/* Top bar */}
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0" style={{ padding: '14px 18px' }}>
        <h1 className="text-xl font-bold">🔧 מסוף רחבה</h1>
        <div className="bg-slate-700 rounded-full text-sm font-semibold text-slate-200" style={{ padding: '6px 14px' }}>
          {sessions.length} רכב{sessions.length !== 1 ? 'ים' : ''} פעיל{sessions.length !== 1 ? 'ים' : ''}
        </div>
      </div>

      {/* Car grid */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px' }}>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <span className="text-5xl">🏁</span>
            <p className="text-lg font-medium">אין רכבים פעילים ברחבה</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {sessions.map(s => {
              const state = timerState(s.opened_at)
              const items = s.yard_session_items ?? []
              const total = sessionTotal(items)
              const m     = minutesSince(s.opened_at)

              const timerCls = state === 'critical'
                ? 'bg-red-600 text-white'
                : state === 'warn'
                ? 'bg-red-100 text-red-800'
                : 'bg-green-100 text-green-800'

              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/yard/${s.id}`)}
                  className={`relative bg-white rounded-2xl text-right border-2 transition-all active:scale-95 hover:shadow-md ${cardBorder[state]}`}
                  style={{ padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.10)' }}
                >
                  {/* Item count badge */}
                  {items.length > 0 && (
                    <span className="absolute top-2.5 left-2.5 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {items.length}
                    </span>
                  )}

                  {/* Make + model */}
                  {(s.make || s.model) && (
                    <div className="text-lg font-bold text-slate-800 leading-tight mb-0.5">
                      {[s.make, s.model].filter(Boolean).join(' ')}
                    </div>
                  )}

                  {/* Plate */}
                  <div className="font-extrabold text-slate-900 leading-tight" style={{ fontSize: '20px', letterSpacing: '1px' }}>
                    {formatPlate(s.plate)}
                  </div>

                  {/* Year */}
                  {s.year && (
                    <div className="text-sm text-slate-400 mt-0.5">{s.year}</div>
                  )}

                  {/* Time + timer */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">קליטה: {fmtTime(s.opened_at)}</span>
                    {total > 0 && <span className="text-sm font-bold text-blue-600">{total.toLocaleString()}₪</span>}
                  </div>
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${timerCls}`}>
                      ⏱ {m} דק׳
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* New car button */}
      <div className="flex-shrink-0" style={{ padding: '14px' }}>
        <button
          onClick={() => { if (newCarLoading) return; setNewCarLoading(true); router.push('/yard/new') }}
          disabled={newCarLoading}
          className="w-full text-white font-bold flex items-center justify-center gap-2.5 transition-all"
          style={{
            borderRadius: '12px', padding: '20px', fontSize: '20px',
            background: newCarLoading ? '#64748b' : '#15803d',
            animation: newCarLoading ? 'btn-loading 0.7s ease-in-out infinite' : 'none',
          }}
        >
          {newCarLoading ? '⏳' : <><span style={{ fontSize: '24px' }}>+</span> קליטת רכב חדש</>}
        </button>
      </div>
    </div>
  )
}
