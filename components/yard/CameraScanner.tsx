'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan:  (code: string) => void
  onClose: () => void
}

// BarcodeDetector is not in TS lib yet
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
  getSupportedFormats?(): Promise<string[]>
}

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const rafRef    = useRef<number>(0)
  const hitRef    = useRef(false)          // prevent double-fire
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setErr('הדפדפן אינו תומך בסריקת מצלמה — נסה Chrome')
      return
    }

    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'],
    })

    let stream: MediaStream | null = null

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scan()
      } catch {
        setErr('לא ניתן לגשת למצלמה — בדוק הרשאות')
      }
    }

    async function scan() {
      if (hitRef.current) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        try {
          const results = await detector.detect(video)
          if (results.length > 0 && !hitRef.current) {
            hitRef.current = true
            onScan(results[0].rawValue)
            return
          }
        } catch { /* frame not ready */ }
      }
      rafRef.current = requestAnimationFrame(scan)
    }

    start()

    return () => {
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 text-white"
        style={{ padding: '14px 18px' }}>
        <span className="font-bold text-lg">סריקת ברקוד</span>
        <button onClick={onClose}
          className="rounded-full bg-white/10 active:bg-white/20 transition-colors"
          style={{ width: 36, height: 36, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ✕
        </button>
      </div>

      {/* Camera or error */}
      <div className="flex-1 relative overflow-hidden">
        {err ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white text-center"
            style={{ padding: 32 }}>
            <svg viewBox="0 0 56 44" width="64" height="50" fill="white" style={{ opacity: 0.4 }}>
              <rect x="0"  y="0" width="4" height="44"/><rect x="8"  y="0" width="2" height="44"/>
              <rect x="13" y="0" width="6" height="44"/><rect x="23" y="0" width="2" height="44"/>
              <rect x="29" y="0" width="4" height="44"/><rect x="37" y="0" width="2" height="44"/>
              <rect x="43" y="0" width="6" height="44"/><rect x="53" y="0" width="2" height="44"/>
            </svg>
            <p className="font-bold text-lg">{err}</p>
            <button onClick={onClose}
              className="bg-white text-black font-bold rounded-xl active:scale-95"
              style={{ padding: '12px 28px', fontSize: 16 }}>
              סגור
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline muted
            />

            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Dark vignette around the target box */}
              <div className="absolute inset-0" style={{
                background: 'rgba(0,0,0,0.45)',
                WebkitMaskImage: 'radial-gradient(ellipse 300px 180px at 50% 50%, transparent 60%, black 100%)',
                maskImage:       'radial-gradient(ellipse 300px 180px at 50% 50%, transparent 60%, black 100%)',
              }} />

              {/* Corner brackets */}
              <div className="relative" style={{ width: 280, height: 160 }}>
                {[
                  'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                  'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-green-400 ${cls}`} />
                ))}

                {/* Animated scan line */}
                <div className="absolute left-2 right-2" style={{
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, #4ade80, transparent)',
                  animation: 'scan-line 1.8s ease-in-out infinite',
                  top: '50%',
                }} />
              </div>
            </div>

            <p className="absolute bottom-10 w-full text-center text-white font-semibold"
              style={{ fontSize: 15, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              כוון את הברקוד למסגרת הירוקה
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0%   { top: 10%; opacity: 0 }
          10%  { opacity: 1 }
          90%  { opacity: 1 }
          100% { top: 90%; opacity: 0 }
        }
      `}</style>
    </div>
  )
}
