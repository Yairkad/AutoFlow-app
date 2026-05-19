'use client'
import { useEffect } from 'react'

export default function LandscapeLock() {
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'landscape-lock-css'
    // Rotate body 90° CW when in portrait so content always appears landscape.
    // Geometry: element placed at left=100vw, top=0 with size 100vh×100vw,
    // then rotated CW around its top-left corner → covers exactly the viewport.
    el.textContent = `
      @media screen and (orientation: portrait) {
        body {
          transform: rotate(90deg);
          transform-origin: top left;
          position: fixed;
          top: 0;
          left: 100vw;
          width: 100vh;
          height: 100vw;
          overflow: hidden;
        }
      }
    `
    document.head.appendChild(el)
    return () => document.getElementById('landscape-lock-css')?.remove()
  }, [])

  return null
}
