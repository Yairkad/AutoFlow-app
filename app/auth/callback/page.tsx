'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Auth callback – handles both implicit flow (hash tokens) and PKCE (code param).
 * Supabase's browser client auto-detects both and fires onAuthStateChange.
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // For PKCE flow: exchange code if present in URL
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {
        router.replace('/login?error=auth_callback')
      })
    }

    // Listen for auth event – fires for both implicit hash tokens and PKCE exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password')
      } else if (event === 'SIGNED_IN') {
        // Distinguish invite (no prior session) vs regular email confirm
        const amr = (session as { amr?: { method: string }[] } | null)?.amr
        const isInvite = amr?.some(a => a.method === 'invite')
        router.replace(isInvite ? '/set-password' : '/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin .8s linear infinite',
          margin: '0 auto 12px',
        }} />
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>מאמת...</p>
      </div>
    </div>
  )
}
