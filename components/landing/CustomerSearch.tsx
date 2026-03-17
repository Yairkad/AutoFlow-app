'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CustomerSearch() {
  const router = useRouter()
  const [plate, setPlate] = useState('')
  const [phone4, setPhone4] = useState('')
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setNotFound(false)
    setError('')

    const cleanPlate = plate.trim().toUpperCase()
    const cleanPhone = phone4.trim()

    if (!cleanPlate) { setError('יש להזין מספר לוחית רישוי'); return }
    if (cleanPhone.length !== 4 || !/^\d{4}$/.test(cleanPhone)) {
      setError('יש להזין 4 ספרות אחרונות של מספר הטלפון')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/public/customer-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: cleanPlate, phone4: cleanPhone }),
      })
      const data = await res.json()

      if (data.found && data.token) {
        router.push(`/track/${data.token}`)
      } else {
        setNotFound(true)
      }
    } catch {
      setError('שגיאת חיבור – אנא נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSearch} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Plate input */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a2a6c', marginBottom: '6px' }}>
            לוחית רישוי
          </label>
          <input
            type="text"
            value={plate}
            onChange={e => { setPlate(e.target.value); setNotFound(false); setError('') }}
            placeholder="לדוגמה: 12-345-67"
            maxLength={10}
            style={inputSt}
            aria-label="לוחית רישוי"
          />
        </div>

        {/* Phone 4 digits */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a2a6c', marginBottom: '6px' }}>
            4 ספרות אחרונות של הטלפון
          </label>
          <input
            type="tel"
            value={phone4}
            onChange={e => { setPhone4(e.target.value.replace(/\D/g, '').slice(0, 4)); setNotFound(false); setError('') }}
            placeholder="לדוגמה: 5678"
            maxLength={4}
            style={inputSt}
            aria-label="4 ספרות אחרונות של הטלפון"
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }} role="alert">{error}</p>
        )}

        {/* Not found message */}
        {notFound && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px',
            padding: '12px 16px', fontSize: '14px', color: '#0369a1', lineHeight: 1.6,
          }} role="status">
            אין רכב בטיפול כרגע – מוזמנים להגיע ולקבל את השירות הטוב ביותר!
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#94a3b8' : '#1a2a6c',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '13px 24px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'מחפש...' : 'חפש את הרכב שלי'}
        </button>
      </div>
    </form>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '15px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  direction: 'rtl',
}
