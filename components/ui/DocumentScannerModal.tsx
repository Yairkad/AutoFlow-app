'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { PDFDocument } from 'pdf-lib'

type Phase = 'camera' | 'preview' | 'review'

interface Page {
  dataUrl: string
  enhanced: boolean
}

interface Props {
  onComplete: (file: File) => void
  onClose: () => void
}

export default function DocumentScannerModal({ onComplete, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('camera')
  const [pages, setPages] = useState<Page[]>([])
  const [currentPreview, setCurrentPreview] = useState<string>('')
  const [enhanced, setEnhanced] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [loading, setLoading] = useState(false)

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setCameraError(true)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Capture frame from video
  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCurrentPreview(dataUrl)
    setEnhanced(false)
    stopCamera()
    setPhase('preview')
  }

  // Apply B&W enhancement on canvas, return new dataUrl
  function applyEnhancement(dataUrl: string, bw: boolean): Promise<string> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        if (bw) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const d = imageData.data
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
            // Increase contrast for scan-like look
            const v = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30)
            d[i] = d[i + 1] = d[i + 2] = v
          }
          ctx.putImageData(imageData, 0, 0)
        }
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.src = dataUrl
    })
  }

  async function toggleEnhance() {
    const next = !enhanced
    setEnhanced(next)
    const newUrl = await applyEnhancement(currentPreview, next)
    setCurrentPreview(newUrl)
  }

  // Add page to list and go back to camera
  function addPage() {
    setPages(prev => [...prev, { dataUrl: currentPreview, enhanced }])
    setPhase('review')
  }

  function addAnotherPage() {
    setPages(prev => [...prev, { dataUrl: currentPreview, enhanced }])
    setCurrentPreview('')
    setPhase('camera')
    startCamera()
  }

  function removePage(i: number) {
    setPages(prev => prev.filter((_, idx) => idx !== i))
  }

  // Finish – build PDF or single image
  async function finish() {
    setLoading(true)
    try {
      const allPages = pages.length > 0 ? pages : [{ dataUrl: currentPreview, enhanced }]

      if (allPages.length === 1) {
        // Single page → return as JPEG
        const res = await fetch(allPages[0].dataUrl)
        const blob = await res.blob()
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
        onComplete(file)
        return
      }

      // Multiple pages → merge to PDF
      const pdf = await PDFDocument.create()
      for (const page of allPages) {
        const res = await fetch(page.dataUrl)
        const bytes = await res.arrayBuffer()
        const img = await pdf.embedJpg(bytes)
        const pdfPage = pdf.addPage([img.width, img.height])
        pdfPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      const pdfBytes = await pdf.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const file = new File([blob], `scan_${Date.now()}.pdf`, { type: 'application/pdf' })
      onComplete(file)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: '#000', display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'rgba(0,0,0,0.7)',
        color: '#fff', flexShrink: 0,
      }}>
        <button onClick={() => { stopCamera(); onClose() }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
          ✕
        </button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {phase === 'camera' && (pages.length > 0 ? `סריקה – עמוד ${pages.length + 1}` : 'סריקת מסמך')}
          {phase === 'preview' && 'תצוגה מקדימה'}
          {phase === 'review' && `${pages.length} עמוד${pages.length !== 1 ? 'ים' : ''}`}
        </span>
        <div style={{ width: 32 }} />
      </div>

      {/* Camera phase */}
      {phase === 'camera' && (
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {cameraError ? (
            <div style={{ color: '#fff', textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
              <div style={{ marginBottom: 8 }}>לא ניתן לגשת למצלמה</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>אפשר הרשאת מצלמה בדפדפן</div>
            </div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {/* Guide overlay */}
              <div style={{
                position: 'absolute',
                top: '10%', left: '5%', right: '5%', bottom: '18%',
                border: '2.5px solid rgba(255,255,255,0.8)',
                borderRadius: 8,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }}>
                {/* Corner marks */}
                {[
                  { top: -3, left: -3 }, { top: -3, right: -3 },
                  { bottom: -3, left: -3 }, { bottom: -3, right: -3 },
                ].map((pos, i) => (
                  <div key={i} style={{
                    position: 'absolute', width: 18, height: 18,
                    borderTop: i < 2 ? '3px solid #fff' : undefined,
                    borderBottom: i >= 2 ? '3px solid #fff' : undefined,
                    borderLeft: i % 2 === 0 ? '3px solid #fff' : undefined,
                    borderRight: i % 2 === 1 ? '3px solid #fff' : undefined,
                    ...pos,
                  }} />
                ))}
              </div>
              {/* Capture button */}
              <button onClick={capture} style={{
                position: 'absolute', bottom: 28,
                width: 68, height: 68, borderRadius: '50%',
                background: '#fff', border: '4px solid rgba(255,255,255,0.5)',
                cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }} />
              {/* Existing pages count */}
              {pages.length > 0 && (
                <button onClick={() => setPhase('review')} style={{
                  position: 'absolute', bottom: 36, right: 24,
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  border: '2px solid #fff', borderRadius: 8,
                  padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                }}>
                  {pages.length} עמ׳ →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Preview phase */}
      {phase === 'preview' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentPreview} alt="תצוגה מקדימה"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{
            padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
            background: '#1a1a1a', flexShrink: 0,
          }}>
            <button onClick={toggleEnhance} style={{
              padding: '10px', borderRadius: 10, border: '2px solid',
              borderColor: enhanced ? '#4ade80' : '#555',
              background: enhanced ? 'rgba(74,222,128,0.15)' : 'transparent',
              color: enhanced ? '#4ade80' : '#aaa', fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600,
            }}>
              {enhanced ? '✓ מצב סריקה (שחור-לבן)' : '◐ הפעל מצב סריקה'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={addAnotherPage} style={{
                flex: 1, padding: '11px', borderRadius: 10,
                border: '1.5px solid #555', background: 'transparent',
                color: '#ddd', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                ➕ עמוד נוסף
              </button>
              <button onClick={addPage} style={{
                flex: 1, padding: '11px', borderRadius: 10,
                border: 'none', background: 'var(--primary, #2563eb)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                המשך →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review phase */}
      {phase === 'review' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
            {pages.map((p, i) => (
              <div key={i} style={{ position: 'relative', width: 'calc(50% - 6px)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={`עמוד ${i + 1}`}
                  style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 8 }} />
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  borderRadius: 12, padding: '2px 8px', fontSize: 12,
                }}>{i + 1}</div>
                <button onClick={() => removePage(i)} style={{
                  position: 'absolute', top: 4, left: 4,
                  background: 'rgba(220,38,38,0.85)', color: '#fff',
                  border: 'none', borderRadius: '50%', width: 24, height: 24,
                  cursor: 'pointer', fontSize: 13, lineHeight: 1,
                }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, background: '#1a1a1a', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={() => { startCamera(); setPhase('camera') }} style={{
              flex: 1, padding: '11px', borderRadius: 10,
              border: '1.5px solid #555', background: 'transparent',
              color: '#ddd', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ➕ עמוד נוסף
            </button>
            <button onClick={finish} disabled={loading || pages.length === 0} style={{
              flex: 1, padding: '11px', borderRadius: 10, border: 'none',
              background: loading ? '#555' : 'var(--primary, #2563eb)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              {loading ? '⏳ מעבד...' : `✓ סיים (${pages.length > 1 ? 'PDF' : 'תמונה'})`}
            </button>
          </div>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
