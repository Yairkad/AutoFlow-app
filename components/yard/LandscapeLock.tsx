'use client'

import { useState, useEffect } from 'react'

export default function LandscapeLock() {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    // Try the Screen Orientation API lock (Android Chrome PWA supports this)
    try {
      screen.orientation.lock('landscape').catch(() => {})
    } catch {}

    function check() {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  if (!isPortrait) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900 text-white"
      style={{ gap: '16px' }}
    >
      <div style={{ fontSize: '56px' }}>🔄</div>
      <div className="font-bold text-center" style={{ fontSize: '22px' }}>סובב את המכשיר</div>
      <div className="text-slate-400 text-center" style={{ fontSize: '15px' }}>המסוף מיועד לשימוש לרוחב</div>
    </div>
  )
}
