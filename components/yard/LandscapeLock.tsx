'use client'
import { useEffect } from 'react'

export default function LandscapeLock() {
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'landscape-lock-css'
    el.textContent = `
      .landscape-lock-overlay { display: none; }
      @media screen and (orientation: portrait) {
        .landscape-lock-overlay { display: flex; }
      }
    `
    document.head.appendChild(el)
    return () => document.getElementById('landscape-lock-css')?.remove()
  }, [])

  return (
    <div
      className="landscape-lock-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#1e293b', color: 'white',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '16px', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '56px' }}>🔄</div>
      <div style={{ fontSize: '22px', fontWeight: 700 }}>סובב את המסך</div>
      <div style={{ fontSize: '14px', opacity: 0.65 }}>המסוף מיועד למצב לרוחב</div>
    </div>
  )
}
