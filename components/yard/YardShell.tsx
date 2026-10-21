'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { YARD_SECTIONS, canYard, sectionForPath, type YardKey } from '@/lib/yard/access'
import { createClient } from '@/lib/supabase/client'
import { YARD_IDLE_MS } from '@/lib/auth/yard-session'
import YardLogin from './YardLogin'
import { startLiveRefresh } from '@/lib/hooks/useLiveRefresh'

interface Props {
  isAdmin: boolean
  modules: string[]
  userName: string | null
  children: React.ReactNode
}

type Counts = Partial<Record<YardKey, number>>

export default function YardShell({ isAdmin, modules, userName, children }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [counts, setCounts] = useState<Counts>({})

  const subject  = { isAdmin, modules }
  const sections = YARD_SECTIONS.filter(s => canYard(subject, s.key))
  const current  = sectionForPath(pathname)
  const allowed  = !current || canYard(subject, current.key)

  // Open-item badges; refreshed on navigation, on realtime changes by others, and every 2 min
  const [countsTick, setCountsTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/yard/counts')
      .then(r => r.ok ? r.json() : null)
      .then(c => { if (c && !cancelled) setCounts(c) })
      .catch(() => { /* badge counts are best-effort */ })
    return () => { cancelled = true }
  }, [countsTick, pathname])

  useEffect(() => {
    const sb = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => setCountsTick(t => t + 1), 500) }
    const ch = sb.channel('yard-shell-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tire_loans' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_requests' }, soon)
      .subscribe()
    const stopLive = startLiveRefresh(soon, 30_000)   // focus + every 30s — realtime is unreliable on Netfree
    return () => { clearTimeout(timer); stopLive(); sb.removeChannel(ch) }
  }, [])

  // Idle terminal → sign the employee out so the next person has to pick their own name
  useEffect(() => {
    let last = Date.now()
    const touch = () => { last = Date.now() }
    const evs = ['pointerdown', 'keydown', 'touchstart'] as const
    evs.forEach(e => window.addEventListener(e, touch, { passive: true }))
    const id = setInterval(() => {
      if (Date.now() - last < YARD_IDLE_MS) return
      clearInterval(id)
      fetch('/api/yard-auth/logout', { method: 'POST' }).finally(() => router.refresh())
    }, 30_000)
    return () => { clearInterval(id); evs.forEach(e => window.removeEventListener(e, touch)) }
  }, [router])

  const userButton = (compact: boolean) => (
    <button
      onClick={() => { setOpen(false); setSwitching(true) }}
      className="flex items-center gap-1.5 bg-slate-700 active:bg-slate-600 text-white font-bold rounded-xl"
      style={compact
        ? { padding: '6px 10px', fontSize: '14px', maxWidth: '45vw', minHeight: 40 }
        : { padding: '8px 4px', fontSize: '11px', flexDirection: 'column', width: '100%' }}
      aria-label="החלפת עובד"
    >
      <span className="truncate" style={{ maxWidth: '100%' }}>👤 {userName ?? 'עובד'}</span>
      <span className="text-slate-300" style={{ fontSize: compact ? '12px' : '10px' }}>🔄 החלף</span>
    </button>
  )

  // NOTE: no <aside> here — globals.css pushes every <aside> off-screen below 900px
  // (rule written for the main app sidebar), which made this drawer open empty.

  // Rail (tablet / desktop): icon above label
  const rail = (
    <nav className="flex flex-col gap-1.5" style={{ padding: '10px 8px' }}>
      {sections.map(s => {
        const active = current?.key === s.key
        const n = counts[s.key] ?? 0
        return (
          <Link
            key={s.key}
            href={s.href}
            className={`relative flex flex-col items-center justify-center text-center rounded-xl font-bold transition-all active:scale-95 ${active ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-slate-700'}`}
            // inline colour: globals.css styles <a> outside Tailwind's layers, so a text-* class loses
            style={{ padding: '10px 4px', fontSize: '12px', lineHeight: 1.2, textDecoration: 'none', minHeight: '64px', color: active ? '#0f172a' : '#e2e8f0' }}
          >
            <span style={{ fontSize: '24px', marginBottom: '3px' }}>{s.icon}</span>
            {s.label}
            {n > 0 && (
              <span className="absolute bg-red-500 text-white rounded-full font-black"
                style={{ top: 4, left: 4, fontSize: '11px', minWidth: '20px', padding: '1px 5px' }}>
                {n}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  // Drawer (phone): one finger-sized row per section
  const drawerNav = (
    <nav className="flex flex-col gap-1" style={{ padding: '8px 10px' }}>
      {sections.map(s => {
        const active = current?.key === s.key
        const n = counts[s.key] ?? 0
        return (
          <Link
            key={s.key}
            href={s.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl font-bold ${active ? 'bg-white text-slate-900' : 'text-slate-100 active:bg-slate-700'}`}
            style={{ padding: '12px 14px', fontSize: '17px', textDecoration: 'none', minHeight: '54px', color: active ? '#0f172a' : '#f1f5f9' }}
          >
            <span style={{ fontSize: '24px', width: 30, textAlign: 'center' }}>{s.icon}</span>
            <span className="flex-1">{s.label}</span>
            {n > 0 && (
              <span className="bg-red-500 text-white rounded-full font-black" style={{ fontSize: '13px', minWidth: '24px', padding: '2px 7px', textAlign: 'center' }}>
                {n}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const currentCount = current ? counts[current.key] ?? 0 : 0
  const totalOpen = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <div className="flex h-full w-full" style={{ minHeight: 0 }}>
      {/* Rail — tablets and desktop */}
      <div className="hidden md:flex flex-col bg-slate-900 flex-shrink-0 overflow-y-auto" style={{ width: '96px' }}>
        <div style={{ padding: '8px 8px 0' }}>{userButton(false)}</div>
        {rail}
      </div>

      {/* Drawer — phones */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setOpen(false)} style={{ background: 'rgba(0,0,0,.5)' }}>
          <div className="bg-slate-900 h-full overflow-y-auto flex flex-col shadow-2xl" style={{ width: '270px', maxWidth: '85vw' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-700" style={{ padding: '12px 14px' }}>
              <span className="text-white font-black" style={{ fontSize: '18px' }}>תפריט</span>
              <button onClick={() => setOpen(false)} className="text-slate-300 font-black" style={{ fontSize: '24px', width: 44, height: 44 }} aria-label="סגור">✕</button>
            </div>
            {drawerNav}
            <div className="mt-auto" style={{ padding: '12px' }}>{userButton(true)}</div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col" style={{ minWidth: 0, minHeight: 0, height: '100%' }}>
        {/* Phone top bar with the menu button */}
        <div className="md:hidden flex items-center gap-3 bg-slate-900 text-white flex-shrink-0" style={{ padding: '6px 10px', minHeight: '52px' }}>
          <button
            onClick={() => setOpen(true)}
            className="relative bg-slate-700 active:bg-slate-600 rounded-xl font-black"
            style={{ width: 46, height: 42, fontSize: '22px' }}
            aria-label="תפריט"
          >
            ☰
            {totalOpen > 0 && (
              <span className="absolute bg-red-500 rounded-full" style={{ top: -3, left: -3, width: 12, height: 12 }} />
            )}
          </button>
          <span className="font-bold truncate flex-1" style={{ fontSize: '17px' }}>
            {current ? `${current.icon} ${current.label}` : 'מסוף רחבה'}
            {currentCount > 0 ? ` (${currentCount})` : ''}
          </span>
          {userButton(true)}
        </div>

        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          {allowed ? children : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3" style={{ background: '#f0f4f8' }}>
              <span className="text-5xl">🔒</span>
              <p className="text-lg font-bold">אין לך הרשאה למסך הזה</p>
              <p className="text-sm">אפשר לבקש מהמנהל להוסיף אותו בהגדרות העובד</p>
            </div>
          )}
        </div>
      </div>
      {switching && <YardLogin onCancel={() => setSwitching(false)} currentName={userName} />}
    </div>
  )
}
