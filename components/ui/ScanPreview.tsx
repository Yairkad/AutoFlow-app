'use client'

// Thumbnail of a scanned / picked document (image, or the first page of a PDF via pdfjs) so the
// user sees how the scan came out before it's saved. Click → full-size view.
import { useEffect, useState } from 'react'

async function pdfFirstPage(file: File, width: number): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const page = await pdf.getPage(1)
  const vp1 = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: width / vp1.width })
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height)
  await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as Parameters<typeof page.render>[0]).promise
  const url = c.toDataURL('image/jpeg', .85)
  pdf.destroy()
  return url
}

/** Preview image URL for a file: object URL for images, rendered first page for PDFs. */
export function useFilePreview(file: File | null, width = 900) {
  const [state, setState] = useState<{ file: File | null; url: string | null; pages: number }>({ file: null, url: null, pages: 0 })
  useEffect(() => {
    if (!file) return
    let alive = true, objUrl: string | null = null
    if (file.type.startsWith('image/')) {
      objUrl = URL.createObjectURL(file)
      const u = objUrl
      setTimeout(() => alive && setState({ file, url: u, pages: 1 }), 0)
    } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      pdfFirstPage(file, width).then(u => alive && setState({ file, url: u, pages: 1 })).catch(() => alive && setState({ file, url: null, pages: 0 }))
    }
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [file, width])
  return state.file === file ? state.url : null
}

export default function ScanPreview({ file, size = 72, caption, actions }: {
  file: File; size?: number; caption?: React.ReactNode; actions?: React.ReactNode
}) {
  const url = useFilePreview(file)
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
      <button type="button" onClick={() => url && setOpen(true)} title="הגדלה" style={{
        width: size, height: size * 1.3, flex: 'none', border: '1px solid var(--border)', borderRadius: 6, background: '#fff',
        padding: 0, cursor: url ? 'zoom-in' : 'default', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="תצוגה מקדימה של הסריקה" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>טוען…</span>}
      </button>
      <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}>
        {caption}
        {actions && <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
      </div>
      {open && url && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="הסריקה בגודל מלא" style={{ maxWidth: '100%', maxHeight: '100%', background: '#fff', borderRadius: 6, boxShadow: '0 10px 40px rgba(0,0,0,.4)' }} />
        </div>
      )}
    </div>
  )
}

/** Small text-link style button used inside the preview's action row. */
export function LinkBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', color: danger ? 'var(--danger)' : 'var(--text-muted)' }}>
      {children}
    </button>
  )
}
