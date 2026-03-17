'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'ראשי',          icon: '🏠', module: null },
  { href: '/expenses',    label: 'הוצאות',         icon: '💰', module: 'expenses' },
  { href: '/billing',     label: 'חשבונות',        icon: '🧾', module: 'billing' },
  { href: '/debts',       label: 'חובות',          icon: '💳', module: 'debts' },
  { href: '/employees',   label: 'עובדים',         icon: '👷', module: 'employees' },
  { href: '/products',    label: 'מוצרים',         icon: '📦', module: ['products', 'products_view'] },
  { href: '/tires',       label: 'צמיגים',         icon: '🔘', module: ['tires', 'tires_view'] },
  { href: '/cars',        label: 'רכבים',          icon: '🚗', module: 'cars' },
  { href: '/quotes',      label: 'הצעות מחיר',     icon: '💬', module: 'quotes' },
  { href: '/suppliers',   label: 'ספקים',          icon: '🏭', module: 'suppliers' },
  { href: '/alignment',   label: 'פרונט',          icon: '🔩', module: 'alignment' },
  { href: '/inspections', label: 'בדיקות קניה',   icon: '📝', module: 'inspections' },
  { href: '/reminders',   label: 'תזכורות',        icon: '🔔', module: 'reminders' },
  { href: '/documents',   label: 'מסמכים',         icon: '📄', module: 'documents' },
  { href: '/settings',    label: 'הגדרות',         icon: '⚙️', module: 'settings' },
  { href: '/my-profile',  label: 'הפרופיל שלי',    icon: '👤', module: 'my_profile' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const sb = useRef(createClient()).current
  const [pressed, setPressed]     = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [modules, setModules]     = useState<string[]>([])
  const [loaded, setLoaded]       = useState(false)

  useEffect(() => {
    // getSession reads localStorage — works even when network/CORS is blocked
    sb.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id
      if (!uid) { setLoaded(true); return }
      sb.from('profiles').select('role, allowed_modules').eq('id', uid).maybeSingle()
        .then(({ data: p }) => {
          if (p) {
            setIsAdmin(p.role === 'admin')
            setModules(p.allowed_modules ?? [])
          } else {
            setIsAdmin(true)
          }
          setLoaded(true)
        })
    })
  }, [sb])

  useEffect(() => {
    setPendingHref(null)
    setPressed(null)
  }, [pathname])

  function isVisible(item: typeof NAV_ITEMS[0]) {
    if (!loaded) return false
    if (isAdmin && item.href !== '/my-profile') return true
    if (item.module === null) return true           // dashboard always visible
    const required = Array.isArray(item.module) ? item.module : [item.module]
    return required.some(m => modules.includes(m))
  }

  return (
    <aside style={{
      position: 'fixed',
      top: 'var(--header-h)',
      right: 0,
      bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border)',
      overflowY: 'auto',
      zIndex: 90,
      padding: '8px 0',
    }}>
      {NAV_ITEMS.filter(isVisible).map((item) => {
        const isActive = pathname === item.href
        const isPending = pendingHref === item.href && !isActive
        const isHighlighted = isActive || isPending
        return (
          <Link
            key={item.href}
            href={item.href}
            onMouseDown={() => { setPressed(item.href); setPendingHref(item.href) }}
            onMouseUp={() => setPressed(null)}
            onMouseLeave={() => setPressed(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '7px 16px',
              fontSize: '13px',
              fontWeight: isHighlighted ? 600 : 400,
              color: isHighlighted ? 'var(--primary)' : 'var(--text)',
              background: isHighlighted ? '#f0fdf6' : 'transparent',
              borderRight: isHighlighted ? '3px solid var(--primary)' : '3px solid transparent',
              transition: 'all .15s, transform .1s',
              transform: pressed === item.href ? 'scale(0.93)' : 'scale(1)',
              opacity: isPending ? 0.75 : 1,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '17px', minWidth: '22px' }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {isPending && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                border: '2px solid var(--primary)',
                borderTopColor: 'transparent',
                display: 'inline-block',
                animation: 'sidebar-spin .6s linear infinite',
                flexShrink: 0,
              }} />
            )}
          </Link>
        )
      })}
    </aside>
  )
}
