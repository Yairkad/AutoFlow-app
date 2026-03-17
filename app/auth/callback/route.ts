import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase auth callback – handles:
 *  • Email confirmation links (signup)
 *  • Password reset (redirected here when redirectTo = /auth/callback?next=/reset-password)
 *  • Magic link sign-ins
 *
 * All these flows land here with ?code=<PKCE code> and optional ?next=<path>
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong – send back to login with error param
  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
