'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'ראשי',          icon: '🏠' },
  { href: '/expenses',   label: 'הוצאות',         icon: '💰' },
  { href: '/billing',    label: 'חשבונות',        icon: '🧾' },
  { href: '/debts',      label: 'חובות',          icon: '💳' },
  { href: '/employees',  label: 'עובדים',         icon: '👷' },
  { href: '/products',   label: 'מוצרים',         icon: '📦' },
  { href: '/tires',      label: 'צמיגים',         icon: '🔘' },
  { href: '/cars',       label: 'רכבים',          icon: '🚗' },
  { href: '/quotes',     label: 'הצעות מחיר',     icon: '💬' },
  { href: '/suppliers',  label: 'ספקים',          icon: '🏭' },
  { href: '/alignment',  label: 'פרונט',          icon: '🔩' },
  { href: '/inspections',label: 'בדיקות קניה',   icon: '📝' },
  { href: '/reminders',  label: 'תזכורות',        icon: '🔔' },
  { href: '/documents',  label: 'מסמכים',         icon: '📄' },
  { href: '/settings',   label: 'הגדרות',         icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [pressed, setPressed] = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Clear pending state when navigation completes
  useEffect(() => {
    setPendingHref(null)
    setPressed(null)
  }, [pathname])

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
      {NAV_ITEMS.map((item) => {
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
