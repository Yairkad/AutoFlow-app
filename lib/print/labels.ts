// Thermal label rendering (XPRINTER, 72mm printable width, 203dpi ≈ 8 dots/mm).
// Every label is drawn on a <canvas> in pure black/white, so Hebrew, the logo and the barcode
// print exactly as previewed regardless of the printer driver. The canvas is then sent as an
// image (QZ Tray) or wrapped in a 72mm-wide HTML page (browser print fallback).

import JsBarcode from 'jsbarcode'

export const DPM = 8                     // dots per mm
export const ROLL_MM = 72                // printable width of the roll
const ROLL_W = ROLL_MM * DPM
const FONT = '"Heebo Variable", Heebo, Arial, sans-serif'
const MONO = '"IBM Plex Mono", Consolas, monospace'

export interface CarLabel { plate: string; make: string; model: string; year: string; code: string; note: string }
export interface ProductLabel { name: string; price: string; barcode: string; showBarcode: boolean }
export type PriceSize = 'm' | 'l' | 'xl'
/** Product label size: full width at 3 scales, or half width (two labels side by side). */
export type ProductSize = 'l' | 'm' | 's' | 'half'
export type TextSize = 's' | 'm' | 'l' | 'xl'
export interface CustomLine { text: string; size: TextSize; bold: boolean }
export interface CustomLabel { lines: CustomLine[]; align: 'center' | 'right'; logo: boolean; frame: boolean }
export interface TagSize { w: number; h: number }      // mm, the paper window of the key tag

/** Default key-tag window: the common clear vehicle key fob takes a ~45×25mm paper insert. */
export const DEFAULT_TAG: TagSize = { w: 45, h: 25 }

/** Wait for the label fonts so the first canvas isn't drawn with a fallback font. */
export async function loadLabelFonts() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px ${FONT}`, 'אב'), document.fonts.load(`800 40px ${FONT}`, '₪1'),
      document.fonts.load(`700 40px ${MONO}`, '12'),
    ])
  } catch { /* draw with whatever is available */ }
}

/** Load a logo (data URL / URL) and turn it into a pure black/white canvas for thermal print. */
export function loadBwLogo(src: string): Promise<HTMLCanvasElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        // trim to a sane working size
        const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const x = c.getContext('2d')!
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height)
        const d = x.getImageData(0, 0, c.width, c.height)
        let minX = c.width, minY = c.height, maxX = -1, maxY = -1
        for (let i = 0; i < d.data.length; i += 4) {
          const l = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]
          const v = l < 170 ? 0 : 255
          d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255
          if (!v) { const p = i / 4, px = p % c.width, py = (p / c.width) | 0; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py }
        }
        x.putImageData(d, 0, 0)
        if (maxX < 0) { resolve(null); return }                       // all white — nothing to print
        const t = document.createElement('canvas')                    // crop the white margins
        t.width = maxX - minX + 1; t.height = maxY - minY + 1
        t.getContext('2d')!.drawImage(c, minX, minY, t.width, t.height, 0, 0, t.width, t.height)
        resolve(t)
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function blank(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  return { c, ctx }
}

/** Largest font size (≤ size) at which text fits maxW. Leaves ctx.font set. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number, family = FONT) {
  let s = Math.max(10, Math.round(size))
  for (; s > 10; s -= 2) { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break }
  ctx.font = `${weight} ${s}px ${family}`
  return s
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | null, bizName: string, cx: number, y: number, maxW: number, maxH: number) {
  if (logo) {
    const r = Math.min(maxW / logo.width, maxH / logo.height)
    const w = logo.width * r, h = logo.height * r
    ctx.drawImage(logo, cx - w / 2, y + (maxH - h) / 2, w, h)
  } else if (bizName) {
    ctx.direction = 'rtl'
    const fs = fit(ctx, bizName, 800, maxH * .8, maxW)
    ctx.fillText(bizName, cx, y + maxH / 2 + fs * .36)
  }
}

function lineText(ctx: CanvasRenderingContext2D, text: string, weight: number, cx: number, y: number, rowH: number, maxW: number, family = FONT) {
  ctx.direction = family === MONO ? 'ltr' : 'rtl'
  const fs = fit(ctx, text, weight, rowH, maxW, family)
  ctx.fillText(text, cx, y + rowH / 2 + fs * .36)
  ctx.direction = 'rtl'
}

/** A car label in a box of wmm × hmm. Rows share the height by weight; empty rows are skipped. */
export function drawCarLabel(car: CarLabel, wmm: number, hmm: number, logo: HTMLCanvasElement | null, bizName: string, showLogo: boolean) {
  const { c, ctx } = blank(wmm * DPM, hmm * DPM)
  const w = c.width, h = c.height
  const pad = Math.max(1.5, Math.min(wmm, hmm) * .06) * DPM, iw = w - 2 * pad
  const plate = car.plate.trim() || '—'
  const carLine = [[car.make.trim(), car.model.trim()].filter(Boolean).join(' '), car.year.trim()].filter(Boolean).join(' · ')
  const rows: [string, number][] = []
  if (showLogo && (logo || bizName)) rows.push(['logo', .9])
  rows.push(['plate', 1.4])
  if (carLine) rows.push(['car', .75])
  if (car.code.trim()) rows.push(['code', 1.15])
  if (car.note.trim()) rows.push(['note', .55])
  const tot = rows.reduce((a, r) => a + r[1], 0)
  let y = pad
  for (const [k, wt] of rows) {
    const rh = (h - 2 * pad) * wt / tot
    if (k === 'logo') drawLogo(ctx, logo, bizName, w / 2, y + rh * .05, iw, rh * .85)
    if (k === 'plate') {
      const bh = rh * .86, by = y + rh * .05
      ctx.lineWidth = Math.max(3, DPM * .5); ctx.strokeRect(pad, by, iw, bh)
      lineText(ctx, plate, 700, w / 2, by + bh * .14, bh * .72, iw * .9, MONO)
    }
    if (k === 'car') lineText(ctx, carLine, 700, w / 2, y + rh * .12, rh * .7, iw)
    if (k === 'code') {
      const bh = rh * .82, by = y + rh * .09
      ctx.fillRect(pad, by, iw, bh)
      ctx.fillStyle = '#fff'; lineText(ctx, 'קוד קודן: ' + car.code.trim(), 700, w / 2, by + bh * .17, bh * .66, iw * .92); ctx.fillStyle = '#000'
    }
    if (k === 'note') lineText(ctx, car.note.trim(), 500, w / 2, y + rh * .1, rh * .7, iw)
    y += rh
  }
  return c
}

/** Natural height (mm) of a full-width (72mm) car label for its content. */
export function wideCarHeight(car: CarLabel, showLogo: boolean) {
  return 4 + (showLogo ? 13 : 0) + 17 + ((car.make + car.model + car.year).trim() ? 9 : 0)
    + (car.code.trim() ? 10 : 0) + (car.note.trim() ? 6 : 0) + 3
}

/**
 * One row of key tags across the 72mm roll (as many as fit, side by side), each with a dashed
 * cut frame. Returns the row canvas and how many tags it holds.
 */
export function drawTagRow(tag: HTMLCanvasElement, count: number, frame = true) {
  const gap = 3 * DPM
  const perRow = Math.max(1, Math.floor((ROLL_W + gap) / (tag.width + gap)))
  const n = Math.max(1, Math.min(perRow, count))
  const { c, ctx } = blank(ROLL_W, tag.height + 2 * DPM)
  const total = n * tag.width + (n - 1) * gap
  const x0 = Math.max(0, (ROLL_W - total) / 2)
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (tag.width + gap)
    ctx.drawImage(tag, x, DPM)
    if (frame) { ctx.setLineDash([10, 7]); ctx.lineWidth = 2; ctx.strokeRect(x - 1, DPM - 1, tag.width + 2, tag.height + 2); ctx.setLineDash([]) }
  }
  return { canvas: c, perRow }
}

/**
 * Product price label; height follows the content. 'l' | 'm' | 's' are full roll width at shrinking
 * scale; 'half' is ~34mm wide so two fit side by side (compose rows with drawTagRow(..., false)).
 */
export function drawProductLabel(p: ProductLabel, priceSize: PriceSize, logo: HTMLCanvasElement | null, bizName: string, showLogo: boolean, size: ProductSize = 'l') {
  const k = { l: 1, m: .78, s: .6, half: .55 }[size]
  const W = size === 'half' ? 34 * DPM : ROLL_W
  const pad = (size === 'half' ? 1.5 : 4 * k) * DPM, iw = W - 2 * pad
  const nameFs = Math.round(40 * k), nameLh = Math.round(48 * k)
  const meas = blank(10, 10).ctx
  meas.font = `700 ${nameFs}px ${FONT}`
  const lines = wrap(meas, p.name.trim() || '—', iw).slice(0, size === 'half' ? 2 : 3)
  const ps = Math.round({ m: 64, l: 96, xl: 130 }[priceSize] * k)
  const code = p.barcode.trim()
  const bc = p.showBarcode && code ? barcodeCanvas(code, k, size === 'half') : null
  const hasLogo = showLogo && (logo || bizName)
  const logoH = 11 * DPM * k
  const h = pad + (hasLogo ? logoH + 3 * DPM * k : 0) + lines.length * nameLh + ps + 2 * DPM * k + (bc ? Math.min(bc.height, bc.height * iw / bc.width) + DPM : 0) + DPM
  const { c, ctx } = blank(W, h)
  ctx.direction = 'rtl'
  let y = pad
  if (hasLogo) { drawLogo(ctx, logo, bizName, W / 2, y, iw * .85, logoH); y += logoH + DPM * k; ctx.fillRect(pad, y, iw, 2); y += 2 * DPM * k }
  ctx.font = `700 ${nameFs}px ${FONT}`
  for (const l of lines) { ctx.fillText(l, W / 2, y + nameFs * .95); y += nameLh }
  const price = p.price.trim() ? '₪' + Number(p.price).toLocaleString('he-IL') : '—'
  const fs = fit(ctx, price, 800, ps, iw)
  ctx.fillText(price, W / 2, y + fs * .92); y += ps + 2 * DPM * k
  if (bc) { const bw = Math.min(bc.width, iw), bh = bc.height * bw / bc.width; ctx.drawImage(bc, (W - bw) / 2, y, bw, bh) }
  return c
}

const TEXT_PX: Record<TextSize, number> = { s: 30, m: 42, l: 62, xl: 92 }

/** Free-text label (e.g. an envelope address): lines with their own size / weight, full roll width. */
export function drawCustomLabel(lab: CustomLabel, logo: HTMLCanvasElement | null, bizName: string) {
  const W = ROLL_W, pad = 4 * DPM, iw = W - 2 * pad - (lab.frame ? 2 * DPM : 0)
  const meas = blank(10, 10).ctx
  const rows: { text: string; px: number; bold: boolean }[] = []
  for (const l of lab.lines) {
    const px = TEXT_PX[l.size]
    meas.font = `${l.bold ? 700 : 500} ${px}px ${FONT}`
    const parts = l.text.trim() ? wrap(meas, l.text.trim(), iw) : ['']
    for (const t of parts) rows.push({ text: t, px, bold: l.bold })
  }
  while (rows.length && !rows[rows.length - 1].text) rows.pop()
  const hasLogo = lab.logo && (logo || bizName)
  const logoH = 12 * DPM
  const body = rows.reduce((a, r) => a + (r.text ? r.px * 1.25 : r.px * .6), 0)
  const h = pad * 2 + (hasLogo ? logoH + 2 * DPM : 0) + Math.max(body, 8 * DPM) + (lab.frame ? 2 * DPM : 0)
  const { c, ctx } = blank(W, h)
  if (lab.frame) { ctx.lineWidth = 4; ctx.strokeRect(2 * DPM, 2 * DPM, W - 4 * DPM, h - 4 * DPM) }
  let y = pad + (lab.frame ? DPM : 0)
  if (hasLogo) { drawLogo(ctx, logo, bizName, W / 2, y, iw * .8, logoH); y += logoH + 2 * DPM }
  ctx.direction = 'rtl'
  ctx.textAlign = lab.align === 'right' ? 'right' : 'center'
  const x = lab.align === 'right' ? W - pad - (lab.frame ? DPM : 0) : W / 2
  for (const r of rows) {
    if (!r.text) { y += r.px * .6; continue }
    ctx.font = `${r.bold ? 700 : 500} ${r.px}px ${FONT}`
    ctx.fillText(r.text, x, y + r.px * .98)
    y += r.px * 1.25
  }
  return c
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []; let cur = ''
  for (const w of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w } else cur = t
  }
  if (cur) out.push(cur)
  return out
}

/** EAN-13 when the code is a valid EAN-13, otherwise Code 128. Null if it can't be encoded. */
function barcodeCanvas(code: string, k = 1, narrow = false): HTMLCanvasElement | null {
  const opts = { height: Math.round(10 * DPM * k), fontSize: Math.max(16, Math.round(26 * k)), margin: 0, font: 'IBM Plex Mono', background: '#ffffff', lineColor: '#000000' }
  const tryOne = (format: string, width: number) => {
    const c = document.createElement('canvas')
    try { JsBarcode(c, code, { ...opts, format, width }); return c } catch { return null }
  }
  const w = narrow ? 2 : 3
  return (/^\d{13}$/.test(code) ? tryOne('EAN13', w) : null) ?? tryOne('CODE128', narrow || code.length > 14 ? 2 : 3) ?? tryOne('CODE128', 1)
}

/** Browser-print fallback: the label images stacked on a 72mm-wide page. */
export function labelsPrintHtml(images: { dataUrl: string; hmm: number }[]) {
  const total = images.reduce((a, i) => a + i.hmm, 0) + images.length * 3
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>מדבקות</title><style>
@page { size: ${ROLL_MM}mm ${Math.ceil(total)}mm; margin: 0 }
html,body { margin:0; padding:0 }
img { display:block; width:${ROLL_MM}mm; margin-bottom:3mm; image-rendering:pixelated }
</style></head><body>${images.map(i => `<img src="${i.dataUrl}" style="height:${i.hmm}mm">`).join('')}</body></html>`
}

/**
 * Cut the blank rows above and below the content, leaving `marginMm` of paper on each side, so the
 * roll doesn't feed empty paper before / after a label. Width is kept (the roll width).
 */
export function trimVertical(src: HTMLCanvasElement, marginMm = 1): HTMLCanvasElement {
  const ctx = src.getContext('2d')!
  const { width: w, height: h } = src
  const d = ctx.getImageData(0, 0, w, h).data
  const dark = (y: number) => { for (let x = 0, i = y * w * 4; x < w; x++, i += 4) if (d[i] < 128) return true; return false }
  let top = 0, bottom = h - 1
  while (top < h && !dark(top)) top++
  if (top >= h) return src                                   // blank label — leave as is
  while (bottom > top && !dark(bottom)) bottom--
  const m = Math.round(marginMm * DPM)
  const y0 = Math.max(0, top - m), y1 = Math.min(h, bottom + 1 + m)
  if (y0 === 0 && y1 === h) return src
  const { c, ctx: out } = blank(w, y1 - y0)
  out.drawImage(src, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0)
  return c
}
