import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// ── Public paths – no auth needed ──────────────────────────────────────────
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/reset-password',
  '/set-password',
  '/auth/callback',
  '/onboarding',
  '/track',
  '/privacy',
  '/accessibility',
  '/api/auth',         // send-reset, register-employee
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
  ['/settings',    []],        // admin only
  ['/expenses',    ['expenses']],
  ['/income',      ['income', 'expenses']],
  ['/billing',     ['billing']],
  ['/debts',       ['debts']],
  ['/products',    ['products', 'products_view']],
  ['/tires',       ['tires', 'tires_view']],
  ['/cars',        ['cars']],
  ['/quotes',      ['quotes']],
  ['/suppliers',   ['suppliers']],
  ['/alignment',   ['alignment']],
  ['/inspections', ['inspections']],
  ['/reminders',   ['reminders']],
  ['/documents',   ['documents']],
]

function requiredModulesFor(pathname: string): string[] | null | undefined {
  for (const [route, mods] of ROUTE_MODULES) {
    if (pathname === route || pathname.startsWith(route + '/')) return mods
  }
  return undefined // unknown route → will require admin
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes without any check
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
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
