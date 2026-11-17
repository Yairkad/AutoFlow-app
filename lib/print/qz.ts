// QZ Tray bridge: prints straight to a printer chosen BY NAME (the label printer), without
// touching the Windows default printer and without a print dialog. QZ Tray is a small free
// program installed on the office PC; the page talks to it over a local websocket.
// Not signed yet: QZ Tray shows an "allow this site" prompt (signing can be added later).
// The chosen printer is remembered per computer (localStorage).

type Qz = {
  websocket: { connect: (o?: { retries?: number; delay?: number }) => Promise<void>; isActive: () => boolean }
  printers: { find: (q?: string) => Promise<string[] | string> }
  configs: { create: (printer: string, opts?: Record<string, unknown>) => unknown }
  print: (cfg: unknown, data: unknown[]) => Promise<void>
}

let qzPromise: Promise<Qz> | null = null
const loadQz = () => (qzPromise ??= import('qz-tray').then(m => ((m as { default?: Qz }).default ?? m) as Qz))

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

const ESC_INIT = '\x1B\x40'                 // ESC @  reset
const FEED_CUT = '\x1D\x56\x42\x10'         // GS V 66 n — feed n dots, then partial cut

/**
 * Print label images (PNG data URLs, 72mm = 576 dots wide), one cut per label.
 * 'escpos' (default): raw ESC/POS raster sent through the spooler — printed dot-for-dot, the driver
 *   can't rescale it, and each label ends with a cut command.
 * 'driver': pixel print through the Windows driver (page sized to the label) — for printers that
 *   don't speak ESC/POS; the driver's paper size / scaling settings then matter.
 */
export async function qzPrintLabels(printer: string, labels: { dataUrl: string; hmm: number }[], widthMm: number, method: PrintMethod = 'escpos') {
  const qz = await loadQz()
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
