'use client'

import { useEffect, useState } from 'react'

export default function KeyboardDismiss() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function check() {
      // Keyboard is open when visual viewport is significantly shorter than window
      setVisible(window.innerHeight - vv!.height > 100)
    }

    vv.addEventListener('resize', check)
    return () => vv.removeEventListener('resize', check)
  }, [])

  if (!visible) return null

  return (
    <button
      onPointerDown={e => {
        e.preventDefault() // prevent re-focus
        ;(document.activeElement as HTMLElement)?.blur()
      }}
      style={{
        position: 'fixed',
        bottom: window.innerHeight - (window.visualViewport?.height ?? window.innerHeight) + 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#334155',
        color: '#fff',
        border: 'none',
        borderRadius: '20px',
        padding: '6px 20px',
        fontSize: '18px',
        lineHeight: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'pointer',
      }}
      aria-label="סגור מקלדת"
    >
      ⌄
    </button>
  )
}
