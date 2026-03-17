'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { loginAction } from './actions'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // ── Forgot password ───────────────────────────────────────────────────────
  const [forgotMode, setForgotMode]     = useState(false)
  const [resetEmail, setResetEmail]     = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg]         = useState('')
  const [resetErr, setResetErr]         = useState('')

  // Supabase site URL = /login, so implicit flow tokens land here.
  // Set session from hash tokens and redirect to the right page.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) return

    const params = new URLSearchParams(hash.slice(1))
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type         = params.get('type')

    if (!accessToken || !refreshToken) return

    const supabase = createClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname)
        if (type === 'recovery') router.replace('/reset-password')
        else if (type === 'invite') router.replace('/set-password')
        else router.replace('/dashboard')
      })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const err = await loginAction(email, password)
    if (err) {
      setError(err)
      setLoading(false)
    }
    // on success: loginAction calls redirect('/dashboard') server-side
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) { setResetErr('נא להזין אימייל'); return }
    setResetLoading(true)
    setResetErr('')
    setResetMsg('')

    try {
      const res = await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'שגיאה')
      setResetMsg('מייל איפוס נשלח! בדוק את תיבת הדואר שלך.')
    } catch {
      setResetErr('שגיאה בשליחת המייל, נסה שוב')
    } finally {
      setResetLoading(false)
    }
  }

  // ── Eye icon SVG ─────────────────────────────────────────────────────────
  const EyeIcon = ({ open }: { open: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )

  const inputSt: React.CSSProperties = {
    padding: '9px 12px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '14px',
    background: 'var(--bg)',
    direction: 'rtl',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="/icon-512.png"
            alt="AutoFlow"
            style={{ width: 64, height: 64, borderRadius: '16px', margin: '0 auto 12px', display: 'block', objectFit: 'contain' }}
          />
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>AutoFlow</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            {forgotMode ? 'איפוס סיסמה' : 'ברוך הבא, נא להתחבר'}
          </p>
        </div>

        {/* ── LOGIN FORM ── */}
        {!forgotMode && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="אימייל"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            {/* Password field with eye toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>סיסמה</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ ...inputSt, paddingLeft: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                  title={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                >
                  <EyeIcon open={showPass} />
                </button>
              </div>
              {/* Forgot password link */}
              <div style={{ textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setResetEmail(email); setResetMsg(''); setResetErr('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  שכחתי סיסמה
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
                ⚠️ {error}
              </p>
            )}

            <Button type="submit" fullWidth loading={loading} style={{ marginTop: '4px' }}>
              התחבר
            </Button>
          </form>
        )}

        {/* ── FORGOT PASSWORD FORM ── */}
        {forgotMode && (
          <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
              הזן את האימייל שלך ונשלח קישור לאיפוס הסיסמה
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>אימייל</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                style={inputSt}
              />
            </div>

            {resetErr && (
              <p style={{ fontSize: '13px', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
                ⚠️ {resetErr}
              </p>
            )}
            {resetMsg && (
              <p style={{ fontSize: '13px', color: '#16a34a', textAlign: 'center', margin: 0, background: '#f0fdf4', padding: '10px', borderRadius: '8px' }}>
                ✅ {resetMsg}
              </p>
            )}

            <Button type="submit" fullWidth loading={resetLoading}>
              שלח מייל איפוס
            </Button>

            <button
              type="button"
              onClick={() => setForgotMode(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
            >
              ← חזרה להתחברות
            </button>
          </form>
        )}

      </div>
    </div>
  )
}
