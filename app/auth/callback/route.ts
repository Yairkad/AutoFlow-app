import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase auth callback – handles email confirmation, password reset, and invite flows.
 * redirectTo should always be just "/auth/callback" (no query params) so it matches
 * the Supabase allowed-URLs list exactly.
 *
 * Routing after exchange:
 *  • recovery session  → /reset-password   (password reset email)
 *  • invite session    → /set-password     (employee invite email)
 *  • everything else   → /dashboard        (email confirmation etc.)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const type = data.session.user?.recovery_sent_at ? 'recovery' : null
      const amr  = (data.session as { amr?: { method: string }[] }).amr

      // Detect invite vs recovery vs regular
      const isInvite   = amr?.some(a => a.method === 'invite')
      const isRecovery = !isInvite && !!data.session.user?.recovery_sent_at

      if (isRecovery) return NextResponse.redirect(`${origin}/reset-password`)
      if (isInvite)   return NextResponse.redirect(`${origin}/set-password`)
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
