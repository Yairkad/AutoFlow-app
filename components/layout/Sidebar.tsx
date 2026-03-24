'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SidebarLayoutEditor, { SectionConfig, SIDEBAR_LAYOUT_KEY } from './SidebarLayoutEditor'
import { loadUiSettings } from '@/lib/uiSettings'

// ─── צבע הבועה לכל פריט ───────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard',   label: 'ראשי',                    color: '#3b82f6,#60a5fa', module: null },
  { href: '/expenses',    label: 'הוצאות',                  color: '#f59e0b,#fbbf24', module: 'expenses' },
  { href: '/billing',     label: 'חשבונות',                 color: '#8b5cf6,#a78bfa', module: 'billing' },
  { href: '/debts',       label: 'חובות',                   color: '#ef4444,#f87171', module: 'debts' },
  { href: '/employees',   label: 'עובדים',                  color: '#0ea5e9,#38bdf8', module: null },
  { href: '/products',    label: 'מוצרים',                  color: '#f97316,#fb923c', module: ['products', 'products_view'] },
  { href: '/tires',       label: 'צמיגים',                  color: '#6b7280,#9ca3af', module: ['tires', 'tires_view'] },
  { href: '/cars',        label: 'רכבים',                   color: '#10b981,#34d399', module: 'cars' },
  { href: '/quotes',      label: 'הצעות מחיר',              color: '#ec4899,#f472b6', module: 'quotes' },
  { href: '/suppliers',   label: 'ספקים / נותני שירות',     color: '#64748b,#94a3b8', module: 'suppliers' },
  { href: '/alignment',   label: 'פרונט',                   color: '#14b8a6,#2dd4bf', module: 'alignment' },
  { href: '/inspections', label: 'בדיקות קניה',             color: '#22c55e,#4ade80', module: 'inspections' },
  { href: '/reminders',   label: 'תזכורות',                 color: '#f59e0b,#fde68a', module: 'reminders' },
  { href: '/documents',   label: 'מסמכים',                  color: '#3b82f6,#93c5fd', module: 'documents' },
  { href: '/settings',    label: 'הגדרות',                  color: '#6b7280,#d1d5db', module: 'settings' },
  { href: '/my-profile',  label: 'הפרופיל שלי',             color: '#a855f7,#c084fc', module: 'my_profile' },
]

// ─── חלוקה לקטגוריות — ערוך כאן כרצונך ──────────────────────────────────────
// כל href שלא מופיע כאן יוצג בסוף ללא כותרת
const SECTIONS: { label: string | null; hrefs: string[] }[] = [
  { label: null,       hrefs: ['/dashboard'] },
  { label: 'כספים',   hrefs: ['/expenses', '/billing', '/debts'] },
  { label: 'אנשים',   hrefs: ['/employees'] },
  { label: 'מלאי',    hrefs: ['/products', '/tires', '/cars'] },
  { label: 'עסקאות',  hrefs: ['/quotes', '/suppliers', '/alignment', '/inspections'] },
  { label: 'כללי',    hrefs: ['/reminders', '/documents'] },
  { label: 'מערכת',   hrefs: ['/settings', '/my-profile'] },
]

// ─── אייקונים SVG לכל href ────────────────────────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  '/dashboard':   <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  '/expenses':    <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  '/billing':     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  '/debts':       <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  '/employees':   <><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></>,
  '/products':    <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>,
  '/tires':       <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></>,
  '/cars':        <><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v4h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  '/quotes':      <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  '/suppliers':   <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></>,
  '/alignment':   <><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></>,
  '/inspections': <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></>,
  '/reminders':   <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  '/documents':   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  '/settings':    <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>,
  '/my-profile':  <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const sb = useRef(createClient()).current
  const [pressed, setPressed]           = useState<string | null>(null)
  const [brandPressed, setBrandPressed] = useState(false)
  const [pendingHref, setPendingHref]   = useState<string | null>(null)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [modules, setModules]           = useState<string[]>([])
  const [loaded, setLoaded]             = useState(false)
  const [tenantName, setTenantName]     = useState<string | null>(null)
  const [tenantLogo, setTenantLogo]     = useState<string | null>(null)
  const [editorOpen, setEditorOpen]         = useState(false)
  const [tenantId, setTenantId]             = useState<string | null>(null)
  const [activeSections, setActiveSections] = useState<SectionConfig[]>(() => {
    if (typeof window === 'undefined') return SECTIONS
    try {
      const saved = localStorage.getItem(SIDEBAR_LAYOUT_KEY)
      return saved ? JSON.parse(saved) : SECTIONS
    } catch { return SECTIONS }
  })

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id
      if (!uid) { setLoaded(true); return }
      sb.from('profiles').select('role, allowed_modules, tenant_id').eq('id', uid).maybeSingle()
        .then(({ data: p }) => {
          if (p) {
            setIsAdmin(p.role === 'admin' || p.role === 'super_admin')
            setModules(p.allowed_modules ?? [])
            if (p.tenant_id) {
              setTenantId(p.tenant_id)
              sb.from('tenants').select('name, logo_base64, ui_settings').eq('id', p.tenant_id).single()
                .then(({ data: t }) => {
                  if (t) {
                    setTenantName(t.name || null)
                    setTenantLogo(t.logo_base64 || null)
                    // Prefer Supabase layout, fall back to localStorage
                    const remote = (t.ui_settings as any)?.sidebar_layout
                    if (remote) {
                      setActiveSections(remote)
                      localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(remote))
                    }
                  }
                })
            }
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
    onClose?.()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function isVisible(item: typeof NAV_ITEMS[0]) {
    if (!loaded) return false
    if (isAdmin && item.href !== '/my-profile') return true
    if (item.module === null) return true
    const required = Array.isArray(item.module) ? item.module : [item.module]
    return required.some(m => modules.includes(m))
  }

  const itemsByHref = Object.fromEntries(NAV_ITEMS.map(i => [i.href, i]))

  function SkeletonNav() {
    return (
      <div style={{ padding: '4px 0' }}>
        {[80, 60, 90, 70, 85, 55, 75].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', margin: '1px 6px' }}>
            <div className="shimmer" style={{ width: 30, height: 30, borderRadius: '8px', flexShrink: 0 }} />
            <div className="shimmer sidebar-brand-text" style={{ width: w, height: 11, borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    )
  }

  function NavItem({ item }: { item: typeof NAV_ITEMS[0] }) {
    const isActive      = pathname === item.href
    const isPending     = pendingHref === item.href && !isActive
    const isHighlighted = isActive || isPending
    const [from, to]    = item.color.split(',')

    return (
      <Link
        href={item.href}
        title={item.label}
        onMouseDown={() => { setPressed(item.href); setPendingHref(item.href) }}
        onMouseUp={() => setPressed(null)}
        onMouseLeave={() => setPressed(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '5px 10px',
          margin: '1px 6px',
          borderRadius: '9px',
          fontSize: '13px',
          fontWeight: isHighlighted ? 600 : 400,
          color: isHighlighted ? 'var(--text)' : 'var(--text)',
          background: isHighlighted ? 'var(--bg-hover, #f3faf6)' : 'transparent',
          boxShadow: isHighlighted ? 'inset 3px 0 0 var(--primary)' : 'none',
          textDecoration: 'none',
          transition: 'all .15s, transform .1s',
          transform: pressed === item.href ? 'scale(0.95)' : 'scale(1)',
          opacity: isPending ? 0.75 : 1,
          cursor: 'pointer',
        }}
      >
        {/* colored icon bubble */}
        <span style={{
          width: 30, height: 30,
          borderRadius: '8px',
          background: `linear-gradient(135deg, ${from}, ${to})`,
          boxShadow: `0 2px 5px ${from}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          transition: 'transform .15s',
          transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
        }}>
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {ICONS[item.href]}
          </svg>
        </span>

        <span style={{ flex: 1 }}>{item.label}</span>

        {isPending && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            border: '2px solid var(--primary)',
            borderTopColor: 'transparent',
            display: 'inline-block',
            animation: 'spin .6s linear infinite',
            flexShrink: 0,
          }} />
        )}
      </Link>
    )
  }

  // Build visible items set for rendering
  const visibleHrefs = new Set(NAV_ITEMS.filter(isVisible).map(i => i.href))

  return (
    <>
    <aside
      data-mobile-open={String(mobileOpen)}
      style={{
        position: 'fixed',
        top: 'var(--header-h)',
        right: 0,
        bottom: 0,
        width: 'var(--sidebar-w)',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 90,
        padding: '0',
        transition: 'transform .25s ease',
      }}
    >
      {/* Business branding */}
      <Link
        href="/dashboard"
        onMouseDown={() => setBrandPressed(true)}
        onMouseUp={() => setBrandPressed(false)}
        onMouseLeave={() => setBrandPressed(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '4px',
          textDecoration: 'none', color: 'var(--text)',
          transition: 'transform .1s, opacity .1s',
          transform: brandPressed ? 'scale(0.94)' : 'scale(1)',
          opacity: brandPressed ? 0.8 : 1,
        }}
        title={tenantName || 'AutoFlow — דף ראשי'}
      >
        {tenantLogo
          ? <img src={tenantLogo} alt="לוגו" style={{ width: 32, height: 32, borderRadius: '8px', objectFit: 'contain', flexShrink: 0 }} />
          : <img src="/icon-512.png" alt="AutoFlow" style={{ width: 32, height: 32, borderRadius: '8px', objectFit: 'contain', flexShrink: 0 }} />
        }
        <div className="sidebar-brand-text" style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
            {tenantName || 'AutoFlow'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2 }}>מערכת ניהול</div>
        </div>
      </Link>

      {!loaded && <SkeletonNav />}

      {loaded && (
        <div style={{ padding: '4px 0 8px' }}>
          {activeSections.map((section, si) => {
            const sectionItems = section.hrefs
              .filter(h => visibleHrefs.has(h))
              .map(h => itemsByHref[h])
              .filter(Boolean)

            if (sectionItems.length === 0) return null

            return (
              <div key={si}>
                {section.label && (
                  <div style={{
                    fontSize: '9px',
                    letterSpacing: '1.3px',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    padding: '10px 16px 3px',
                    opacity: 0.6,
                  }}>
                    {section.label}
                  </div>
                )}
                {sectionItems.map(item => (
                  <NavItem key={item.href} item={item} />
                ))}
              </div>
            )
          })}
        </div>
      )}
      {/* Edit layout button — subtle footer */}
      {loaded && (
        <button
          onClick={() => setEditorOpen(true)}
          style={{
            display: 'block', width: '100%',
            padding: '10px 0', marginTop: '4px',
            borderTop: '1px solid var(--border)',
            background: 'none', border: 'none',
            fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer',
            opacity: 0.5, transition: 'opacity .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
        >
          ✦ ערוך סידור תפריט
        </button>
      )}

    </aside>

    <SidebarLayoutEditor
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      defaultSections={SECTIONS}
      allItems={NAV_ITEMS.filter(isVisible).map(({ href, label, color }) => ({ href, label, color }))}
      tenantId={tenantId}
      onSave={setActiveSections}
    />
    </>
  )
}
