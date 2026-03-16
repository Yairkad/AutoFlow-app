'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

const STEPS = ['פרטי עסק', 'לוגו', 'סיום']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep]           = useState(0)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // Step 0
  const [name, setName]           = useState('')
  const [subTitle, setSubTitle]   = useState('')
  const [phone, setPhone]         = useState('')
  const [address, setAddress]     = useState('')
  const [taxId, setTaxId]         = useState('')

  // Step 1
  const [logo, setLogo]           = useState<string | null>(null)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogo(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleFinish = async () => {
    if (!name.trim()) { setError('שם העסק הוא שדה חובה'); return }
    setLoading(true)
    setError('')

    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subTitle, phone, address, taxId, logo }),
    })

    if (!res.ok) {
      const err = await res.json()
      setError('שגיאה: ' + (err.error || 'unknown'))
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
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
        maxWidth: '480px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800 }}>הגדרת העסק</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>כמה פרטים ומוכנים להתחיל</p>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: i <= step ? 'var(--primary)' : 'var(--border)',
                color: i <= step ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700,
                transition: 'background .2s',
              }}>{i + 1}</div>
              <span style={{
                fontSize: '12px',
                color: i === step ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: i === step ? 600 : 400,
              }}>{s}</span>
              {i < STEPS.length - 1 && (
                <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0 – Business info */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="שם העסק *" placeholder='למשל: פנצריה מכבי' value={name} onChange={e => setName(e.target.value)} />
            <Input label="שורה שנייה" placeholder='למשל: תיקון צמיגים ומכונאות' value={subTitle} onChange={e => setSubTitle(e.target.value)} />
            <Input label="טלפון" placeholder="050-0000000" value={phone} onChange={e => setPhone(e.target.value)} />
            <Input label="כתובת" placeholder="רחוב, עיר" value={address} onChange={e => setAddress(e.target.value)} />
            <Input label='ח.פ / עוסק מורשה' placeholder="123456789" value={taxId} onChange={e => setTaxId(e.target.value)} />
          </div>
        )}

        {/* Step 1 – Logo */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
              העלה לוגו לעסק (אופציונלי)
            </p>
            {logo ? (
              <img src={logo} alt="לוגו" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)' }} />
            ) : (
              <div style={{
                width: 120, height: 120,
                borderRadius: 12,
                border: '2px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '36px', color: 'var(--text-muted)',
              }}>🏢</div>
            )}
            <label style={{
              padding: '8px 20px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              {logo ? 'החלף לוגו' : 'בחר קובץ'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            </label>
            {logo && (
              <button onClick={() => setLogo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}>
                הסר לוגו
              </button>
            )}
          </div>
        )}

        {/* Step 2 – Done */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>הכל מוכן!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              העסק <strong>{name}</strong> הוגדר בהצלחה.
            </p>
          </div>
        )}

        {error && (
          <p style={{ fontSize: '13px', color: 'var(--danger)', textAlign: 'center', marginTop: '12px' }}>
            ⚠️ {error}
          </p>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '10px' }}>
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>→ חזור</Button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <Button onClick={() => {
              if (step === 0 && !name.trim()) { setError('שם העסק הוא שדה חובה'); return }
              setError('')
              setStep(s => s + 1)
            }}>
              המשך ←
            </Button>
          ) : (
            <Button onClick={handleFinish} loading={loading}>
              🚀 כניסה למערכת
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
