'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function SetPasswordPage() {
  const router  = useRouter()
  const [ready, setReady]       = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setReady(true)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('הסיסמאות אינן תואמות'); return }
    if (password.length < 6)  { setError('סיסמה חייבת להכיל לפחות 6 תווים'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }

    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        padding: '40px 36px', width: '100%', maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="/icon-512.png"
            alt="AutoFlow"
            style={{ width: 64, height: 64, borderRadius: '16px', margin: '0 auto 12px', display: 'block', objectFit: 'contain' }}
          />
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>AutoFlow</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>בחר סיסמא לחשבונך</p>
        </div>

        {!ready ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>מאמת קישור...</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="סיסמה חדשה"
              type="password"
              placeholder="לפחות 6 תווים"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <Input
              label="אימות סיסמה"
              type="password"
              placeholder="הזן שוב את הסיסמה"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--danger)', textAlign: 'center' }}>⚠️ {error}</p>
            )}

            <Button type="submit" fullWidth loading={loading} style={{ marginTop: '4px' }}>
              כניסה למערכת ←
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
