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

/**
 * Print label images (PNG data URLs, 72mm wide) one page each, in order. Each page is sized to its
 * own label so the continuous roll feeds only as much paper as the label needs.
 */
export async function qzPrintLabels(printer: string, labels: { dataUrl: string; hmm: number }[], widthMm: number) {
  const qz = await loadQz()
  for (const l of labels) {
    const cfg = qz.configs.create(printer, {
      units: 'mm', size: { width: widthMm, height: Math.ceil(l.hmm) }, margins: 0,
      colorType: 'blackwhite', scaleContent: true, rasterize: false, interpolation: 'nearest-neighbor',
    })
    await qz.print(cfg, [{ type: 'pixel', format: 'image', flavor: 'base64', data: l.dataUrl.replace(/^data:image\/png;base64,/, '') }])
  }
}
