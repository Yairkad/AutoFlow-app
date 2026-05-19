'use client'
import { useEffect, type ReactNode } from 'react'

export default function LandscapeLock({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'landscape-lock-css'
    // Geometry (portrait: vw=short, vh=long):
    //   div placed at left=100vw (right edge), width=100vh, height=100vw
    //   rotate(90deg) CW around top-left → maps exactly onto full viewport
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
    return () => document.getElementById('landscape-lock-css')?.remove()
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
