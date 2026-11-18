// QZ Tray bridge: prints straight to a printer chosen BY NAME (the label printer), without
// touching the Windows default printer and without a print dialog. QZ Tray is a small free
// program installed on the office PC; the page talks to it over a local websocket.
// Requests are signed with the business key (app/api/qz/*); trust needs override.crt on the PC.
// The chosen printer is remembered per computer (localStorage).

type Qz = {
  websocket: { connect: (o?: { retries?: number; delay?: number }) => Promise<void>; isActive: () => boolean }
  printers: { find: (q?: string) => Promise<string[] | string> }
  configs: { create: (printer: string, opts?: Record<string, unknown>) => unknown }
  print: (cfg: unknown, data: unknown[]) => Promise<void>
  security: {
    setCertificatePromise: (fn: (resolve: (v: string | null) => void, reject: (e: unknown) => void) => void) => void
    setSignatureAlgorithm: (alg: string) => void
    setSignaturePromise: (fn: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void
  }
}

let qzPromise: Promise<Qz> | null = null
const loadQz = () => (qzPromise ??= import('qz-tray').then(m => {
  const qz = ((m as { default?: Qz }).default ?? m) as Qz
  // Signed requests: once the business certificate is trusted on this PC (override.crt in the
  // QZ Tray folder), QZ Tray stops asking to allow the site on every print.
  // If the key isn't available (e.g. migration 116 not run yet) fall back to unsigned requests —
  // printing still works, QZ Tray just keeps asking to allow the site.
  qz.security.setCertificatePromise(resolve => {
    fetch('/api/qz/cert', { cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null).then(c => resolve(c || null))
  })
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise(toSign => resolve => {
    fetch('/api/qz/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: toSign }) })
      .then(r => r.ok ? r.text() : '').catch(() => '').then(resolve)
  })
  return qz
}))

const PRINTER_KEY = 'labels.printer'
export const getLabelPrinter = () => { try { return localStorage.getItem(PRINTER_KEY) || '' } catch { return '' } }
export const setLabelPrinter = (name: string) => { try { localStorage.setItem(PRINTER_KEY, name) } catch { /* private mode */ } }

/** Connect to the local QZ Tray. Resolves false when it isn't installed / running. */
export async function qzConnect(): Promise<boolean> {
  try {
    const qz = await loadQz()
    if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 0, delay: 0 })
    return qz.websocket.isActive()
  } catch { return false }
}

export async function qzPrinters(): Promise<string[]> {
  const qz = await loadQz()
  const r = await qz.printers.find()
  return Array.isArray(r) ? r : [r]
}

export type PrintMethod = 'escpos' | 'driver'
const METHOD_KEY = 'labels.method'
export const getPrintMethod = (): PrintMethod => { try { return localStorage.getItem(METHOD_KEY) === 'driver' ? 'driver' : 'escpos' } catch { return 'escpos' } }
export const setPrintMethod = (m: PrintMethod) => { try { localStorage.setItem(METHOD_KEY, m) } catch { /* private mode */ } }

// Head-to-cutter distance in mm, measured with the calibration label (0 = not calibrated → each
// label is fed to the cutter separately, as before). Per computer, like the printer choice.
const GAP_KEY = 'labels.cutGap'
export const getCutGap = () => { try { return Math.max(0, Number(localStorage.getItem(GAP_KEY)) || 0) } catch { return 0 } }
export const setCutGap = (mm: number) => { try { localStorage.setItem(GAP_KEY, String(mm)) } catch { /* private mode */ } }

/** Send a ready ESC/POS job (base64) as-is. */
export async function qzPrintRaw(printer: string, base64: string) {
  const qz = await loadQz()
  await qz.print(qz.configs.create(printer), [{ type: 'raw', format: 'command', flavor: 'base64', data: base64 }])
}

const ESC_INIT = '\x1B\x40'                 // ESC @  reset
const FEED_CUT = '\x1D\x56\x42\x00'         // GS V 66 0 — feed just to the cutter, then partial cut (no extra blank)

/**
 * Print label images (PNG data URLs, 72mm = 576 dots wide), one cut per label.
 * 'escpos' (default): raw ESC/POS raster sent through the spooler — printed dot-for-dot, the driver
 *   can't rescale it, and each label ends with a cut command. Once the cutter gap is calibrated,
 *   several labels go out as one continuous job with no blank paper between them (lib/print/escpos).
 * 'driver': pixel print through the Windows driver (page sized to the label) — for printers that
 *   don't speak ESC/POS; the driver's paper size / scaling settings then matter.
 */
export async function qzPrintLabels(printer: string, labels: { dataUrl: string; hmm: number; canvas?: HTMLCanvasElement }[], widthMm: number, method: PrintMethod = 'escpos') {
  const qz = await loadQz()
  const gap = getCutGap()
  // Calibrated + several labels: one continuous job, each cut placed exactly between two labels.
  if (method === 'escpos' && gap > 0 && labels.length > 1 && labels.every(l => l.canvas)) {
    const { continuousJob } = await import('@/lib/print/escpos')
    await qzPrintRaw(printer, continuousJob(labels.map(l => l.canvas!), gap))
    return
  }
  const b64 = (u: string) => u.replace(/^data:image\/png;base64,/, '')
  if (method === 'escpos') {
    const cfg = qz.configs.create(printer)
    const data: unknown[] = [ESC_INIT]
    for (const l of labels) data.push(
      { type: 'raw', format: 'image', flavor: 'base64', data: b64(l.dataUrl), options: { language: 'ESCPOS', dotDensity: 'double' } },
      FEED_CUT,
    )
    await qz.print(cfg, data)
    return
  }
  for (const l of labels) {
    const cfg = qz.configs.create(printer, {
      units: 'mm', size: { width: widthMm, height: Math.ceil(l.hmm) }, margins: 0,
      colorType: 'blackwhite', scaleContent: false, density: 8, rasterize: false, interpolation: 'nearest-neighbor',
    })
    await qz.print(cfg, [{ type: 'pixel', format: 'image', flavor: 'base64', data: b64(l.dataUrl) }])
  }
}
