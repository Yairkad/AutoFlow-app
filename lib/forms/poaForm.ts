// Ministry of Transport power-of-attorney form (ייפוי כוח לאדם פרטי) — the official PDF
// (public/forms/yipuy-koah.pdf) is the background, our fields are overlaid on top.
// All positions are in PDF points (A4 = 594.96 × 841.92), origin top-left.

export const POA_PDF_URL = '/forms/yipuy-koah.pdf'
export const PAGE_W = 594.96
export const PAGE_H = 841.92

export type FieldKind = 'text' | 'digits' | 'mark'

export interface FieldBox {
  x: number
  y: number
  w: number
  h: number
  fs: number           // font size (pt)
}

export interface FieldDef extends FieldBox {
  id: string
  label: string
  kind: FieldKind
  boxes?: number       // digits: number of boxes spread across w (left → right)
  align?: 'right' | 'center' | 'left'
  ltr?: boolean
}

// default positions measured from the PDF's own drawing (box borders / underscores)
const ownerRows = [
  { id: 453.5, name: 453.0 },
  { id: 476.1, name: 475.1 },
  { id: 498.1, name: 497.2 },
]

export const FIELDS: FieldDef[] = [
  { id: 'plate', label: 'מספר רכב', kind: 'text', x: 248.4, y: 102, w: 110.6, h: 19.4, fs: 13, align: 'center', ltr: true },
  { id: 'mark_sell',  label: '☐ למכירת הרכב',   kind: 'mark', x: 523.9, y: 151.4, w: 9.5, h: 10.5, fs: 11 },
  { id: 'mark_buy',   label: '☐ לקניית הרכב',   kind: 'mark', x: 523.9, y: 178.8, w: 9.5, h: 10.5, fs: 11 },
  { id: 'mark_other', label: '☐ לפעולה אחרת',  kind: 'mark', x: 523.9, y: 206.2, w: 9.5, h: 10.5, fs: 11 },
  { id: 'other_text', label: 'פירוט פעולה אחרת', kind: 'text', x: 240, y: 204.5, w: 140, h: 13, fs: 10.5, align: 'right' },
  ...ownerRows.flatMap((r, i) => [
    { id: `owner${i}_id`,   label: `בעלים ${i + 1} – ת"ז`, kind: 'digits' as const, boxes: 9, x: 66.5, y: r.id, w: 146.2, h: 12.8, fs: 11 },
    { id: `owner${i}_name`, label: `בעלים ${i + 1} – שם`,  kind: 'text' as const, x: 221, y: r.name, w: 134.5, h: 21.6, fs: 11, align: 'right' as const },
  ]),
  { id: 'proxy_id',   label: 'מיופה כוח – ת"ז', kind: 'digits', boxes: 9, x: 328.9, y: 573.8, w: 162.8, h: 12.7, fs: 11 },
  { id: 'proxy_name', label: 'מיופה כוח – שם', kind: 'text', x: 94.4, y: 567.5, w: 152.5, h: 16, fs: 11.5, align: 'center' },
  { id: 'valid_until', label: 'תוקף האישור', kind: 'text', x: 250.2, y: 669, w: 126.9, h: 14, fs: 11.5, align: 'center', ltr: true },
]

export const FIELD_BY_ID = Object.fromEntries(FIELDS.map(f => [f.id, f])) as Record<string, FieldDef>

// ── calibration ──
// per-field overrides + a whole-page printer offset (mm), stored per tenant
export interface PoaLayout {
  fields: Record<string, Partial<FieldBox>>
  offsetX: number      // mm, + = right
  offsetY: number      // mm, + = down
}

export const emptyLayout = (): PoaLayout => ({ fields: {}, offsetX: 0, offsetY: 0 })

export function fieldBox(layout: PoaLayout, id: string): FieldDef {
  return { ...FIELD_BY_ID[id], ...(layout.fields[id] ?? {}) }
}

// ── form data ──
export interface Person { name: string; idNum: string }
export type PoaAction = 'sell' | 'buy' | 'other' | ''

export interface PoaData {
  plate: string
  action: PoaAction
  otherText: string
  owners: Person[]      // up to 3 rows
  proxy: Person
  validUntil: string    // YYYY-MM-DD
}

export const emptyPerson = (): Person => ({ name: '', idNum: '' })
export const newPoa = (): PoaData => ({
  plate: '', action: '', otherText: '',
  owners: [emptyPerson(), emptyPerson(), emptyPerson()],
  proxy: emptyPerson(), validUntil: '',
})

// saved quick-fill people
export interface SavedPerson extends Person { id: string }

export function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

// the text printed in each field for the given data
export function fieldValue(d: PoaData, id: string): string {
  const owner = id.match(/^owner(\d)_(id|name)$/)
  if (owner) {
    const p = d.owners[+owner[1]]
    return owner[2] === 'id' ? p?.idNum ?? '' : p?.name ?? ''
  }
  switch (id) {
    case 'plate':       return d.plate
    case 'mark_sell':   return d.action === 'sell' ? 'X' : ''
    case 'mark_buy':    return d.action === 'buy' ? 'X' : ''
    case 'mark_other':  return d.action === 'other' ? 'X' : ''
    case 'other_text':  return d.action === 'other' ? d.otherText : ''
    case 'proxy_id':    return d.proxy.idNum
    case 'proxy_name':  return d.proxy.name
    case 'valid_until': return fmtDMY(d.validUntil)
  }
  return ''
}

// ID numbers shorter than 9 digits are written with leading zeros
export function idDigits(v: string, boxes: number): string[] {
  const clean = v.replace(/\D/g, '').slice(0, boxes)
  const padded = clean && clean.length < boxes ? clean.padStart(boxes, '0') : clean
  return Array.from({ length: boxes }, (_, i) => padded[i] ?? '')
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// Print page: the rendered PDF as a full-bleed A4 background + absolutely positioned text, in pt.
export function poaPrintHtml(bgDataUrl: string, layout: PoaLayout, d: PoaData): string {
  const ox = layout.offsetX * 72 / 25.4
  const oy = layout.offsetY * 72 / 25.4
  const parts: string[] = []
  for (const def of FIELDS) {
    const f = fieldBox(layout, def.id)
    const v = fieldValue(d, def.id)
    if (!v) continue
    const base = `position:absolute;top:${f.y + oy}pt;height:${f.h}pt;font-size:${f.fs}pt;line-height:${f.h}pt;`
    if (f.kind === 'digits') {
      const n = f.boxes ?? 9
      const cw = f.w / n
      idDigits(v, n).forEach((ch, i) => {
        if (ch) parts.push(`<div style="${base}left:${f.x + ox + i * cw}pt;width:${cw}pt;text-align:center">${ch}</div>`)
      })
    } else {
      const align = f.kind === 'mark' ? 'center' : f.align ?? 'right'
      const weight = f.kind === 'mark' ? 'font-weight:700;' : ''
      parts.push(`<div dir="${f.ltr ? 'ltr' : 'rtl'}" style="${base}${weight}left:${f.x + ox}pt;width:${f.w}pt;text-align:${align};white-space:nowrap;overflow:hidden">${esc(v)}</div>`)
    }
  }
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>ייפוי כוח${d.plate ? ' – ' + esc(d.plate) : ''}</title>
<style>
  @page { size: A4; margin: 0 }
  html, body { margin: 0; padding: 0 }
  body { font-family: Arial, 'Segoe UI', sans-serif; color: #000 }
  .page { position: relative; width: ${PAGE_W}pt; height: ${PAGE_H}pt; overflow: hidden }
  .page img { position: absolute; inset: 0; width: 100%; height: 100% }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
</style></head><body>
<div class="page"><img src="${bgDataUrl}" alt="">${parts.join('')}</div>
<script>
  const img = document.querySelector('img');
  const go = () => setTimeout(() => window.print(), 100);
  if (img.complete) go(); else img.onload = go;
</script>
</body></html>`
}

// Render the official PDF's first page to a PNG data URL (pdfjs, client only)
export async function renderPoaBackground(scale = 3): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const task = getDocument(POA_PDF_URL)
  const pdf = await task.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  await task.destroy()
  return canvas.toDataURL('image/png')
}
