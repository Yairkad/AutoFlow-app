// Print a ready-made HTML document straight to the print dialog — no separate browser tab.
// The page is written into a hidden iframe; fonts and images are awaited, then the iframe prints
// and removes itself. Auto-print scripts/handlers inside the HTML are stripped (we print here).
export function printHtml(html: string) {
  const clean = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => (/print\s*\(/.test(m) ? '' : m))
    .replace(/\son(load|click)="[^"]*print\(\)[^"]*"/gi, '')

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0', pointerEvents: 'none' })
  document.body.appendChild(frame)

  const win = frame.contentWindow, doc = frame.contentDocument
  if (!win || !doc) { frame.remove(); return }
  doc.open(); doc.write(clean); doc.close()

  let done = false
  const cleanup = () => setTimeout(() => frame.remove(), 500)
  const go = async () => {
    if (done) return
    done = true
    try { await doc.fonts?.ready } catch { /* older browsers */ }
    await Promise.all(Array.from(doc.images).map(img => img.complete ? null
      : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) })))
    win.addEventListener('afterprint', cleanup, { once: true })
    win.focus()
    win.print()
    setTimeout(() => frame.isConnected && frame.remove(), 120_000)   // safety net if afterprint never fires
  }
  if (doc.readyState === 'complete') go()
  else frame.addEventListener('load', go, { once: true })
}
