'use client'
import { useEffect } from 'react'

export default function LandscapeLock() {
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'landscape-lock-css'
    el.textContent = `
      @media screen and (orientation: portrait) {
        body {
          transform: rotate(90deg);
          transform-origin: left top;
          width: 100vh !important;
          height: 100vw !important;
          overflow: hidden;
          position: fixed;
          top: 100%;
          left: 0;
        }
      }
    `
    document.head.appendChild(el)
    return () => document.getElementById('landscape-lock-css')?.remove()
  }, [])

  return null
}
