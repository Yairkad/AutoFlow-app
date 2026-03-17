'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady]           = useState(false)
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Check for existing session (covers slow navigation / page refresh)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('הסיסמה חייבת להיות לפחות 6 תווים')
      return
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (error) {
      setError('שגיאה בעדכון הסיסמה. ייתכן שהקישור פג תוקף — בקש קישור חדש.')
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    }
  }

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
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: 52, height: 52,
            background: 'var(--primary)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', margin: '0 auto 12px',
          }}>🔐</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>סיסמה חדשה</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>הזן סיסמה חדשה לחשבונך</p>
        </div>

        {!ready && !success && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>מאמת קישור...</p>
          </div>
        )}

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#16a34a' }}>הסיסמה עודכנה בהצלחה!</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>מועבר לדשבורד...</p>
          </div>
        ) : ready ? (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* New password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>סיסמה חדשה</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="לפחות 6 תווים"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ ...inputSt, paddingLeft: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', left: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>אימות סיסמה</label>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="חזור על הסיסמה"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                style={inputSt}
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>
                ⚠️ {error}
              </p>
            )}

            <Button type="submit" fullWidth loading={loading}>
              עדכן סיסמה
            </Button>

            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
            >
              ← חזרה להתחברות
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
