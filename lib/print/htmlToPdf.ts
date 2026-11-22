// Render a ready-made print HTML document (one element per A4 page) into a PDF file and download it.
// Each page is rendered by the browser itself (html-to-image → SVG foreignObject), so Hebrew/RTL
// looks exactly like on screen; pages are embedded as JPEG into an A4 PDF with pdf-lib.
import { toJpeg } from 'html-to-image'
import { PDFDocument } from 'pdf-lib'

const A4_W = 595.28, A4_H = 841.89   // pt

export async function htmlToPdf(html: string, opts: { pageSelector: string; fileName: string; extraCss?: string }) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  // Off-screen but laid out at real A4 width (a 0×0 iframe would collapse the layout).
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '820px', height: '1200px', border: '0' })
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument!
    doc.open()
    doc.write(clean.replace('</head>', `<style>
      body{background:#fff!important;margin:0!important}
      ${opts.pageSelector}{width:210mm!important;height:297mm!important;margin:0!important;box-shadow:none!important;background:#fff!important}
      ${opts.extraCss ?? ''}
    </style></head>`))
    doc.close()
    await new Promise<void>(r => (doc.readyState === 'complete' ? r() : frame.addEventListener('load', () => r(), { once: true })))
    try { await doc.fonts?.ready } catch { /* ignore */ }
    await Promise.all(Array.from(doc.images).map(img => img.complete ? null
      : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) })))

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(opts.pageSelector))
    if (!pages.length) throw new Error('no pages')
    const pdf = await PDFDocument.create()
    for (const el of pages) {
      const dataUrl = await toJpeg(el, { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      const jpg = await pdf.embedJpg(dataUrl)
      pdf.addPage([A4_W, A4_H]).drawImage(jpg, { x: 0, y: 0, width: A4_W, height: A4_H })
    }
    const bytes = await pdf.save()
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = opts.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } finally {
    frame.remove()
  }
}
