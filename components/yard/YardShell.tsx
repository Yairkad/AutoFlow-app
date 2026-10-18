'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { YARD_SECTIONS, canYard, sectionForPath, type YardKey } from '@/lib/yard/access'
import { createClient } from '@/lib/supabase/client'

interface Props {
  isAdmin: boolean
  modules: string[]
  userName: string | null
  children: React.ReactNode
}

type Counts = Partial<Record<YardKey, number>>

export default function YardShell({ isAdmin, modules, userName, children }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
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
    const id = setInterval(soon, 120_000)
    return () => { clearTimeout(timer); clearInterval(id); sb.removeChannel(ch) }
  }, [])

  const nav = (
    <nav className="flex flex-col gap-1.5" style={{ padding: '10px 8px' }}>
      {sections.map(s => {
        const active = current?.key === s.key
        const n = counts[s.key] ?? 0
        return (
          <Link
            key={s.key}
            href={s.href}
            onClick={() => setOpen(false)}
            className={`relative flex flex-col items-center justify-center text-center rounded-xl font-bold transition-all active:scale-95 ${active ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-slate-700'}`}
            style={{ padding: '10px 4px', fontSize: '12px', lineHeight: 1.2, textDecoration: 'none', minHeight: '64px' }}
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

  return (
    <div className="flex h-full w-full" style={{ minHeight: 0 }}>
      {/* Rail — tablets in landscape and desktop */}
      <aside className="hidden md:flex flex-col bg-slate-900 flex-shrink-0 overflow-y-auto" style={{ width: '96px' }}>
        {nav}
        {userName && (
          <div className="mt-auto text-center text-slate-400" style={{ fontSize: '11px', padding: '8px 4px' }}>
            👤 {userName}
          </div>
        )}
      </aside>

      {/* Drawer — phones / portrait */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed z-40 bg-slate-900 text-white rounded-full shadow-lg font-black"
        style={{ bottom: 16, right: 16, width: 54, height: 54, fontSize: '22px' }}
        aria-label="תפריט"
      >
        ☰
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setOpen(false)} style={{ background: 'rgba(0,0,0,.5)' }}>
          <aside className="bg-slate-900 h-full overflow-y-auto" style={{ width: '120px' }} onClick={e => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col" style={{ minWidth: 0, minHeight: 0, height: '100%' }}>
        {allowed ? children : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3" style={{ background: '#f0f4f8' }}>
            <span className="text-5xl">🔒</span>
            <p className="text-lg font-bold">אין לך הרשאה למסך הזה</p>
            <p className="text-sm">אפשר לבקש מהמנהל להוסיף אותו בהגדרות העובד</p>
          </div>
        )}
      </div>
    </div>
  )
}
