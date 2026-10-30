import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { YARD_TRACKING_KEY } from '@/lib/yard/access'
import { YARD_COOKIE, verifyYardSession } from '@/lib/auth/yard-session'

// ── Public paths – no auth needed ──────────────────────────────────────────
const PUBLIC_PREFIXES = [
  '/',                 // public landing page
  '/login',
  '/register',
  '/reset-password',
  '/set-password',
  '/auth/callback',
  '/onboarding',
  '/track',
  '/intake',           // purchase-inspection pre-fill form (customer link)
  '/guide',            // public tire & wheel guide (QR at the garage)
  '/for-sale',         // public cars-for-sale catalog
  '/privacy',
  '/terms',
  '/accessibility',
  '/api/auth',         // send-reset, register-employee
  '/api/yard-auth',    // yard terminal: employee picker + PIN login
  '/api/public',       // customer-search
  '/api/store',        // Supabase proxy (RLS protects data)
  '/_next',
  '/favicon',
  '/icon',
  '/manifest',
]

// ── Route → required modules ────────────────────────────────────────────────
// null  = any authenticated user
// []    = admin / super_admin only
// [...] = must have at least one listed module (admins bypass)
const ROUTE_MODULES: [string, string[] | null][] = [
  ['/dashboard',   null],
  ['/my-profile',  null],
  ['/employees',   null],      // all users – directory view for non-admins
  ['/settings',    ['settings']],   // same as the sidebar (admins always pass)
  ['/expenses',    ['expenses']],
  ['/checks',      ['expenses', 'suppliers']],
  ['/bank-sync',   ['bank_sync']],
  ['/reports',     ['financial_reports']],
  ['/income',      ['income', 'expenses']],
  ['/debts',       ['debts']],
  ['/products',    ['products', 'products_view']],
  ['/tires',       ['tires', 'tires_view']],
  ['/stock-count', ['products', 'tires']],
  ['/scan',        ['products', 'tires']],
  ['/cars',        ['cars']],
  ['/suppliers',   ['suppliers']],
  ['/customers',   ['customers']],
  ['/accounts',    ['suppliers', 'customers']],
  ['/contacts',    ['suppliers', 'customers']],
  ['/inspections', ['inspections']],
  ['/test-transfer', ['test_transfer']],
  ['/reminders',   ['reminders']],
  ['/documents',   ['documents']],
  ['/yard-tracking', [YARD_TRACKING_KEY]],
]

function requiredModulesFor(pathname: string): string[] | null | undefined {
  for (const [route, mods] of ROUTE_MODULES) {
    if (pathname === route || pathname.startsWith(route + '/')) return mods
  }
  return undefined // unknown route → will require admin
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Yard API: the terminal's signed PIN cookie, or an office session (office panels call it too).
  // Checked before the public list because '/' there matches every path.
  if (pathname.startsWith('/api/yard/')) {
    if (await verifyYardSession(request.cookies.get(YARD_COOKIE)?.value)) return NextResponse.next({ request })
    const res = NextResponse.next({ request: { headers: request.headers } })
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return res
  }

  // Public pages and static files. '/' is matched exactly — as a prefix it used to match every path,
  // which silently turned off the login + module checks below for the whole app (fixed 2026-10).
  const isStaticFile = /\/[^/]+\.[a-z0-9]+$/i.test(pathname)
  if (pathname === '/' || isStaticFile || PUBLIC_PREFIXES.some(p => p !== '/' && pathname.startsWith(p))) {
    return NextResponse.next({ request })
  }

  // API routes check their own auth (requireAuth / requireYard / cron secret / signed links), and
  // the yard terminal has its own PIN login (app/yard/layout.tsx); the office terminal checks admin
  // server-side. Only the app's pages go through the login + module check here.
  if (pathname.startsWith('/api/') || pathname === '/yard' || pathname.startsWith('/yard/') || pathname.startsWith('/yard-office')) {
    return NextResponse.next({ request })
  }

  // Pass cookies through to the response so Supabase can refresh the session
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  )

  // Verify JWT (doesn't hit DB)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const requiredMods = requiredModulesFor(pathname)

  // Any authenticated user passes for routes with null
  if (requiredMods === null) return response

  // Fetch profile for role / module check (one DB call per protected request)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, allowed_modules, is_active')
    .eq('id', user.id)
    .single()

  // No profile or deactivated → logout
  if (!profile || profile.is_active === false) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'

  // Admin/super_admin can access everything
  if (isAdmin) return response

  // Employee with no matching module → dashboard
  const mods = requiredMods ?? [] // undefined (unknown route) → treat as admin-only
  if (mods.length === 0) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  const userModules: string[] = profile.allowed_modules ?? []
  const hasModule = mods.some(m => userModules.includes(m))
  if (!hasModule) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp).*)',
  ],
}
