'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

function RegisterForm() {
  const router   = useRouter()
  const params   = useSearchParams()
  const token    = params.get('token')
  const isEmployee = params.get('type') === 'employee'

  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const [prefillEmail, setPrefillEmail] = useState('')
  const [fullName, setFullName]     = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!token) { setTokenValid(false); return }
    const supabase = createClient()
    supabase
      .from('registration_tokens')
      .select('id, email')
      .eq('token', token)
      .single()
      .then(({ data }) => {
        setTokenValid(!!data)
        if (data?.email) {
          setPrefillEmail(data.email)
          setEmail(data.email)
        }
      })
  }, [token])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('הסיסמאות אינן תואמות'); return }
    if (password.length < 6)  { setError('סיסמה חייבת להכיל לפחות 6 תווים'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })

    if (signUpErr || !signUpData.user) {
      setError(signUpErr?.message ?? 'שגיאה ברישום')
      setLoading(false)
      return
    }

    if (isEmployee) {
      // Link employee to tenant and burn token
      const res = await fetch('/api/employees/complete-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: signUpData.user.id, token }),
      })
      if (!res.ok) {
        setError('שגיאה בקישור לעסק')
        setLoading(false)
        return
      }
      router.push('/dashboard')
    } else {
      // Owner flow – burn token then onboarding
      await supabase
        .from('registration_tokens')
        .update({ used: true })
        .eq('token', token)
      router.push('/onboarding')
    }
  }

  if (tokenValid === null) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>מאמת קישור...</div>
  }

  if (!tokenValid) {
    return (
      <div style={{
        background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        padding: '40px 36px', width: '100%', maxWidth: '400px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>קישור לא תקין</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          הקישור פג תוקף או כבר נוצל.<br />פנה למנהל המערכת לקבלת קישור חדש.
        </p>
        <Button onClick={() => router.push('/login')} fullWidth>חזרה לכניסה</Button>
      </div>
    )
  }

  return (
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
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          {isEmployee ? 'הגדרת סיסמא לחשבונך' : 'יצירת חשבון חדש'}
        </p>
      </div>

      <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label="שם מלא"
          placeholder="ישראל ישראלי"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          required
        />
        <Input
          label="אימייל"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={!!prefillEmail}
        />
        <Input
          label="סיסמה"
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
          {isEmployee ? 'כניסה למערכת ←' : 'המשך להגדרות עסק ←'}
        </Button>
      </form>

      {!isEmployee && (
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          יש לך חשבון?{' '}
          <a href="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>התחבר</a>
        </p>
      )}
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
