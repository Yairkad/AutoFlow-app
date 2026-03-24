import { useEffect, useState } from 'react'

/** Returns true only on touch devices (phones/tablets). Avoids SSR mismatch. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setIsMobile(navigator.maxTouchPoints > 0)
  }, [])
  return isMobile
}
