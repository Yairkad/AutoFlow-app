'use client'
import { useEffect, type ReactNode } from 'react'

export default function LandscapeLock({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Try native OS lock first (Android Chrome PWA fullscreen).
    // If it works, the keyboard also rotates — no CSS trick needed.
    const tryNativeLock = async () => {
      try {
        await screen.orientation.lock('landscape')
        return true
      } catch {
        return false
      }
    }

    let cssInjected = false

    tryNativeLock().then(locked => {
      if (locked) return // native lock succeeded — nothing else needed

      // Fallback: CSS rotation for browsers that don't support the API
      const el = document.createElement('style')
      el.id = 'landscape-lock-css'
      el.textContent = `
        @media screen and (orientation: portrait) {
          .yard-landscape-lock {
            transform: rotate(90deg) !important;
            transform-origin: top left !important;
            position: fixed !important;
            top: 0 !important;
            left: 100vw !important;
            width: 100vh !important;
            height: 100vw !important;
            overflow: hidden !important;
          }
        }
      `
      document.head.appendChild(el)
      cssInjected = true
    })

    return () => {
      // Release native lock when leaving yard
      try { screen.orientation.unlock() } catch {}
      if (cssInjected) document.getElementById('landscape-lock-css')?.remove()
    }
  }, [])

  return (
    <div
      className="yard-landscape-lock flex flex-col bg-slate-100 select-none"
      style={{ width: '100vw', height: '100vh' }}
    >
      {children}
    </div>
  )
}
