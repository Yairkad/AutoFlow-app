import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public paths that never require authentication
const PUBLIC_EXACT = new Set(['/', '/login', '/privacy', '/terms', '/accessibility', '/register', '/set-password', '/reset-password', '/onboarding'])
const PUBLIC_PREFIX = ['/track/', '/api/public/', '/api/auth/', '/auth/']

function isPublic(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIX.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session – required for Supabase SSR
  const { data: { user } } = await supabase.auth.getUser()

  // Public paths → pass through always
  if (isPublic(request.nextUrl.pathname)) {
    return supabaseResponse
  }

  // Protected paths → redirect to login if not authenticated
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon\\.png|apple-icon\\.png|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
