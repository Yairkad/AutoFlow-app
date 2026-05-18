'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { YardSession } from '@/lib/yard/types'
import { sessionDisplayName, minutesSince, sessionTotal, formatPlate } from '@/lib/yard/types'

interface Props { initialSessions: YardSession[] }

export default function YardDashboard({ initialSessions }: Props) {
  const router  = useRouter()
  const [sessions, setSessions] = useState<YardSession[]>(initialSessions)
  const [, setTick] = useState(0)
  const supabase = createClient()

  // Re-render every 30 s to update timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('yard-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_sessions' }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_session_items' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])  // eslint-disable-line

  function timerState(openedAt: string): 'ok' | 'warn' | 'critical' {
    const m = minutesSince(openedAt)
    if (m > 45) return 'critical'
    if (m > 30) return 'warn'
    return 'ok'
  }

  const borderClass = {
    ok:       'border-transparent',
    warn:     'border-red-500',
    critical: 'border-red-500 animate-[flash_1.1s_ease-in-out_infinite]',
  }

  const timerBadge = (openedAt: string) => {
    const m = minutesSince(openedAt)
    const state = timerState(openedAt)
    const cls = state === 'critical'
      ? 'bg-red-600 text-white'
      : state === 'warn'
      ? 'bg-red-100 text-red-800'
      : 'bg-green-100 text-green-800'
    return <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>⏱ {m} דק׳</span>
  }

  const fmtTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-bold">🔧 מסוף רחבה</h1>
        <span className="text-sm text-slate-300">
          {sessions.length} רכב{sessions.length !== 1 ? 'ים' : ''} פעיל{sessions.length !== 1 ? 'ים' : ''}
        </span>
      </div>

      {/* Car grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <span className="text-5xl">🏁</span>
            <p className="text-lg font-medium">אין רכבים פעילים ברחבה</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {sessions.map(s => {
              const state   = timerState(s.opened_at)
              const items   = s.yard_session_items ?? []
              const total   = sessionTotal(items)
              const display = sessionDisplayName(s)
              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/yard/${s.id}`)}
                  className={`
                    relative bg-white rounded-2xl p-4 text-right border-2 shadow-sm
                    transition-all active:scale-95 hover:shadow-md
                    ${borderClass[state]}
                    ${state === 'critical' ? 'shadow-red-200' : ''}
                  `}
                >
                  {/* Item count badge */}
                  {items.length > 0 && (
                    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {items.length}
                    </span>
                  )}
                  <div className="text-lg font-bold text-slate-800 mb-0.5">{display}</div>
                  <div className="text-base font-bold text-slate-500 tracking-wider mb-2">
                    {formatPlate(s.plate)}
                    {s.year && <span className="font-normal text-sm mr-1">({s.year})</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>קליטה: {fmtTime(s.opened_at)}</span>
                    {total > 0 && <span className="font-bold text-blue-600">{total.toLocaleString()}₪</span>}
                  </div>
                  <div className="mt-1">{timerBadge(s.opened_at)}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* New car button */}
      <div className="p-3 flex-shrink-0">
        <button
          onClick={() => router.push('/yard/new')}
          className="w-full bg-green-700 hover:bg-green-800 active:scale-98 text-white rounded-2xl py-5 text-xl font-bold flex items-center justify-center gap-3 shadow-md transition-all"
        >
          <span className="text-2xl">+</span> קליטת רכב חדש
        </button>
      </div>
    </div>
  )
}
