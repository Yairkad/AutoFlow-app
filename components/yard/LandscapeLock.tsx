'use client'
import { useEffect, useState, type ReactNode } from 'react'

interface Props { children: ReactNode }

export default function LandscapeLock({ children }: Props) {
  const [style, setStyle] = useState<React.CSSProperties>({
    width: '100vw', height: '100vh', overflow: 'hidden',
  })

  useEffect(() => {
    function update() {
      const w = window.innerWidth
      const h = window.innerHeight
      if (h > w) {
        // Portrait → rotate wrapper 90° CW so content appears landscape
        setStyle({
          transform: 'rotate(90deg)',
          transformOrigin: 'top left',
          position: 'fixed',
          top: 0,
          left: h,        // move to right edge of portrait viewport
          width: h,       // rotated width  = portrait height
          height: w,      // rotated height = portrait width
          overflow: 'hidden',
        })
      } else {
        setStyle({ width: '100vw', height: '100vh', overflow: 'hidden' })
      }
    }

    update()
    window.addEventListener('resize', update)
    // orientationchange fires before dimensions update, wait a frame
    const onOrient = () => setTimeout(update, 100)
    window.addEventListener('orientationchange', onOrient)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', onOrient)
    }
  }, [])

  return (
    <div style={style} className="flex flex-col bg-slate-100 select-none">
      {children}
    </div>
  )
}
