'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import SidebarLayoutEditor, { SectionConfig, SIDEBAR_LAYOUT_KEY, SIDEBAR_HIDDEN_KEY } from './SidebarLayoutEditor'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { ALL_YARD_KEYS } from '@/lib/yard/access'

// ─── צבע הבועה לכל פריט ───────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard',   label: 'ראשי',                    color: '#3b82f6,#60a5fa', module: null },
  { href: '/expenses',    label: 'הוצאות',                  color: '#f59e0b,#fbbf24', module: 'expenses' },
  { href: '/checks',      label: 'יומן צ׳קים',               color: '#4338ca,#818cf8', module: ['expenses', 'suppliers'] },
  { href: '/bank-sync',   label: 'התאמת בנק',               color: '#0891b2,#22d3ee', module: 'bank_sync' },
  { href: '/reports',     label: 'דוח ותחזית',              color: '#7c3aed,#a78bfa', module: 'financial_reports' },
  { href: '/debts',       label: 'חובות',                   color: '#ef4444,#f87171', module: 'debts' },
  { href: '/employees',   label: 'עובדים',                  color: '#0ea5e9,#38bdf8', module: null },
  { href: '/products',    label: 'מוצרים',                  color: '#f97316,#fb923c', module: ['products', 'products_view'] },
  { href: '/tires',       label: 'צמיגים',                  color: '#6b7280,#9ca3af', module: ['tires', 'tires_view'] },
  { href: '/scan',        label: 'סריקת ברקוד',             color: '#0f172a,#334155', module: ['products', 'tires'] },
  { href: '/stock-count', label: 'מלאי',                    color: '#334155,#64748b', module: ['products', 'tires'] },
  { href: '/yard-tracking', label: 'מעקב רחבה',             color: '#475569,#94a3b8', module: 'yard_tracking' },
  { href: '/cars',        label: 'רכבים',                   color: '#10b981,#34d399', module: 'cars' },
  { href: '/suppliers',   label: 'ספקים',                   color: '#64748b,#94a3b8', module: 'suppliers' },
  { href: '/customers',   label: 'לקוחות',                  color: '#78716c,#a8a29e', module: 'customers' },
  { href: '/inspections',   label: 'בדיקות קניה',  color: '#22c55e,#4ade80', module: 'inspections' },
  { href: '/test-transfer', label: 'שינוע לטסטים', color: '#d97706,#f59e0b', module: 'test_transfer' },
  { href: '/reminders',   label: 'משימות',                  color: '#f59e0b,#fde68a', module: 'reminders' },
  { href: '/documents',   label: 'מסמכים',                  color: '#3b82f6,#93c5fd', module: 'documents' },
  { href: '/settings',    label: 'הגדרות',                  color: '#6b7280,#d1d5db', module: 'settings' },
  { href: '/my-profile',  label: 'הפרופיל שלי',             color: '#a855f7,#c084fc', module: 'my_profile' },
]

// ─── חלוקה לקטגוריות — ערוך כאן כרצונך ──────────────────────────────────────
const SECTIONS: { label: string | null; hrefs: string[] }[] = [
  { label: null,       hrefs: ['/dashboard'] },
  { label: 'כספים',   hrefs: ['/expenses', '/checks', '/bank-sync', '/reports', '/debts', '/suppliers', '/customers'] },
  { label: 'אנשים',   hrefs: ['/employees'] },
  { label: 'מלאי',    hrefs: ['/products', '/tires', '/scan', '/stock-count', '/yard-tracking', '/cars'] },
  { label: 'עסקאות',  hrefs: ['/inspections', '/test-transfer'] },
  { label: 'כללי',    hrefs: ['/reminders', '/documents'] },
  { label: 'מערכת',   hrefs: ['/settings', '/my-profile'] },
]

// ─── אייקונים SVG לכל href ────────────────────────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  '/dashboard':   <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  '/expenses':    <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  '/checks':      <><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="12" y2="10"/><path d="M14 14c1-2 2-2 3 0s2 2 3 0"/></>,
  '/bank-sync':   <><path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></>,
  '/reports':     <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></>,
  '/debts':       <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  '/employees':   <><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></>,
  '/products':    <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>,
  '/tires':       <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></>,
  '/stock-count': <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  '/yard-tracking': <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></>,
  '/cars':        <><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v4h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  '/suppliers':   <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></>,
  '/customers':   <><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M1 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></>,
  '/inspections':   <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></>,
  '/test-transfer': <><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  '/reminders':   <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  '/documents':   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  '/settings':    <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>,
  '/my-profile':  <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
}

// ─── Merge helper: adds any new hrefs (from SECTIONS) missing in saved layout ──
function mergeMissingSections(saved: SectionConfig[], hiddenHrefs: string[] = []): SectionConfig[] {
  const allSavedHrefs = new Set(saved.flatMap(s => s.hrefs))
  const hiddenSet = new Set(hiddenHrefs)
  let result = saved.map(s => ({ ...s, hrefs: [...s.hrefs] }))
  for (const defaultSection of SECTIONS) {
    for (const href of defaultSection.hrefs) {
      if (!allSavedHrefs.has(href) && !hiddenSet.has(href)) {
        // Find matching section by label, or append to last section
        const target = result.find(s => s.label === defaultSection.label) ?? result[result.length - 1]
        target.hrefs.push(href)
      }
    }
  }
  return result
}

// ─── Skeleton (מחוץ לקומפוננטה — לא יתמאונט מחדש בכל render) ─────────────────
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

type NavItem = typeof NAV_ITEMS[0]

// ─── NavItem (מחוץ לקומפוננטה — קריטי! מניעת unmount בכל render של Sidebar) ───
function NavItem({
  item, pathname, pressed, pendingHref,
  onDown, onUp, onLeave,
}: {
  item: NavItem
  pathname: string
  pressed: string | null
  pendingHref: string | null
  onDown: (href: string) => void
  onUp: () => void
  onLeave: () => void
}) {
  const isActive      = pathname === item.href
  const isPending     = pendingHref === item.href && !isActive
  const isHighlighted = isActive || isPending

  // Redesign: every tab is its own tile; the active one is filled with the brand color
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={isActive ? 'page' : undefined}
      onMouseDown={() => onDown(item.href)}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
      className="nav-tile"
      data-active={isHighlighted ? 'true' : undefined}
      style={{ opacity: isPending ? 0.8 : 1, transform: pressed === item.href ? 'scale(0.98)' : undefined }}
    >
      <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        {ICONS[item.href]}
      </svg>

      <span style={{ flex: 1 }}>{item.label}</span>

      {isPending && (
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          display: 'inline-block',
          animation: 'spin .6s linear infinite',
          flexShrink: 0,
        }} />
      )}
    </Link>
  )
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const { profile, loading: profileLoading } = useProfile()
  const [pressed, setPressed]           = useState<string | null>(null)
  const [brandPressed, setBrandPressed] = useState(false)
  const [pendingHref, setPendingHref]   = useState<string | null>(null)
  const [editorOpen, setEditorOpen]     = useState(false)
  const [activeSections, setActiveSections] = useState<SectionConfig[]>(() => {
    if (typeof window === 'undefined') return SECTIONS
    try {
      const saved = localStorage.getItem(SIDEBAR_LAYOUT_KEY)
      return saved ? mergeMissingSections(JSON.parse(saved)) : SECTIONS
    } catch { return SECTIONS }
  })
  const [hiddenHrefs, setHiddenHrefs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(SIDEBAR_HIDDEN_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const loaded     = !profileLoading
  const isAdmin     = profile?.isAdmin ?? false
  const modules     = profile?.allowedModules ?? []
  const tenantId    = profile?.tenantId ?? null
  const tenantName  = (profile?.tenant?.name as string | undefined) ?? null
  const tenantLogo  = (profile?.tenant?.logo_base64 as string | undefined) ?? null

  // Apply remote sidebar layout (saved per-tenant) once the profile/tenant loads
  useEffect(() => {
    const ui = profile?.tenant?.ui_settings as any
    if (!ui) return
    if (ui.sidebar_layout) {
      const merged = mergeMissingSections(ui.sidebar_layout, ui.sidebar_hidden ?? [])
      setActiveSections(merged)
      localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(merged))
    }
    if (ui.sidebar_hidden) {
      setHiddenHrefs(ui.sidebar_hidden)
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, JSON.stringify(ui.sidebar_hidden))
    }
  }, [profile?.tenant])

  // Clear pending state on route change
  useEffect(() => {
    setPendingHref(null)
    setPressed(null)
    onClose?.()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function isModuleVisible(item: NavItem) {
    if (!loaded) return false
    if (isAdmin && item.href !== '/my-profile') return true
    if (item.module === null) return true
    const required = Array.isArray(item.module) ? item.module : [item.module]
    return required.some(m => modules.includes(m))
  }
  function isVisible(item: NavItem) {
    return isModuleVisible(item) && !hiddenHrefs.includes(item.href)
  }

  const itemsByHref = Object.fromEntries(NAV_ITEMS.map(i => [i.href, i]))
  const visibleHrefs = new Set(NAV_ITEMS.filter(isVisible).map(i => i.href))

  const handleDown  = (href: string) => { setPressed(href); setPendingHref(href) }
  const handleUp    = () => setPressed(null)
  const handleLeave = () => setPressed(null)

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
          background: 'var(--rail)',
          borderLeft: '1px solid var(--rail-line)',
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
            padding: '14px 16px 10px',
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
          <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeSections.map((section, si) => {
              const sectionItems = section.hrefs
                .filter(h => visibleHrefs.has(h))
                .map(h => itemsByHref[h])
                .filter(Boolean)

              if (sectionItems.length === 0) return null

              return (
                <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {section.label && (
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '.04em',
                      color: '#7A8399',
                      padding: '0 6px 1px',
                    }}>
                      {section.label}
                    </div>
                  )}
                  {sectionItems.map(item => (
                    <NavItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      pressed={pressed}
                      pendingHref={pendingHref}
                      onDown={handleDown}
                      onUp={handleUp}
                      onLeave={handleLeave}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Yard terminal quick-launch */}
        {loaded && (isAdmin || modules.some(m => ALL_YARD_KEYS.includes(m))) && (
          <div style={{ display: 'flex', gap: '6px', padding: '10px 12px 4px', borderTop: '1px solid var(--rail-line)' }}>
            {([
              { href: '/yard',        icon: '🔧', label: 'רחבה', title: 'מסוף רחבה' },
              // מסוף משרד is admin-only (proxy.ts) — don't show a link that bounces
              ...(isAdmin ? [{ href: '/yard-office', icon: '🖥', label: 'משרד', title: 'מסוף משרד' }] : []),
            ]).map(({ href, icon, label, title }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" title={title} style={{
                flex: 1, textAlign: 'center', padding: '7px 4px',
                fontSize: '12px', fontWeight: 600,
                borderRadius: '8px', border: '1px solid var(--rail-line)',
                background: 'var(--bg-card)', color: 'var(--text-muted)',
                textDecoration: 'none', transition: 'color .15s, border-color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--rail-line)' }}
              >{icon} <span>{label}</span></a>
            ))}
          </div>
        )}

        {/* Hidden edit button */}
        {loaded && (
          <button
            onClick={() => setEditorOpen(true)}
            style={{
              display: 'block', width: '100%',
              padding: '10px 0', marginTop: '4px',
              background: 'none', border: 'none',
              fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer',
              opacity: 0.4, transition: 'opacity .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
          >
            ערוך סידור תפריט
          </button>
        )}
      </aside>

      <SidebarLayoutEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        defaultSections={SECTIONS}
        currentSections={activeSections}
        allItems={NAV_ITEMS.filter(isModuleVisible).map(({ href, label, color }) => ({ href, label, color }))}
        hiddenHrefs={hiddenHrefs}
        tenantId={tenantId}
        onSave={(sections, hidden) => {
          setActiveSections(sections)
          setHiddenHrefs(hidden)
        }}
      />
    </>
  )
}
