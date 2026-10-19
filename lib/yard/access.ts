// Worker-terminal (/yard) sections and per-employee permission keys.
// Office users: keys live in profiles.allowed_modules (Settings → Users).
// PIN-login employees: employees.yard_modules (Employees screen), NULL = DEFAULT_YARD_MODULES.

export type YardKey =
  | 'yard_terminal' | 'yard_receive' | 'yard_lookup'
  | 'yard_loans' | 'yard_requests' | 'yard_reports'

export interface YardSection { key: YardKey; href: string; icon: string; label: string }

export const YARD_SECTIONS: YardSection[] = [
  { key: 'yard_terminal', href: '/yard',             icon: '🔧', label: 'מסוף רחבה' },
  { key: 'yard_receive',  href: '/yard/receive',     icon: '📦', label: 'קליטת מלאי' },
  { key: 'yard_lookup',   href: '/yard/tire-lookup', icon: '🔍', label: 'מחיר / מלאי' },
  { key: 'yard_loans',    href: '/yard/loans',       icon: '🔁', label: 'השאלות' },
  { key: 'yard_requests', href: '/yard/requests',    icon: '⏳', label: 'לקוחות ממתינים' },
  { key: 'yard_reports',  href: '/yard/reports',     icon: '📊', label: 'דוחות מהירים' },
]

/** Sees money amounts in the quick reports (worker side). */
export const YARD_MONEY_KEY = 'yard_reports_money'
/** Office management page "מעקב רחבה" — sees and edits everything the yard records. */
export const YARD_TRACKING_KEY = 'yard_tracking'

/** A PIN-login employee with no explicit choice (employees.yard_modules NULL): every section, no money. */
export const DEFAULT_YARD_MODULES: string[] = YARD_SECTIONS.map(s => s.key)

export const ALL_YARD_KEYS: string[] = [
  'yard', ...YARD_SECTIONS.map(s => s.key), YARD_MONEY_KEY, YARD_TRACKING_KEY,
]

export interface YardAccessSubject { isAdmin: boolean; modules: string[] }

/**
 * Admins see everything. The office tracking key grants all yard lists.
 * Legacy `yard` (granted before the per-section keys existed) keeps the whole
 * terminal working until the admin picks specific sections for that employee.
 */
export function canYard(u: YardAccessSubject, key: YardKey): boolean {
  if (u.isAdmin) return true
  if (u.modules.includes(key)) return true
  if (u.modules.includes(YARD_TRACKING_KEY) && key !== 'yard_terminal') return true
  const hasSpecific = YARD_SECTIONS.some(s => u.modules.includes(s.key))
  return !hasSpecific && u.modules.includes('yard')
}

export function canYardMoney(u: YardAccessSubject): boolean {
  return u.isAdmin || u.modules.includes(YARD_MONEY_KEY) || u.modules.includes(YARD_TRACKING_KEY)
}

export function sectionForPath(pathname: string): YardSection | undefined {
  // Longest prefix wins so /yard/loans doesn't resolve to /yard
  return [...YARD_SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(s => pathname === s.href || pathname.startsWith(s.href + '/'))
}
