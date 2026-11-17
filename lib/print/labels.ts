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
export function drawTagRow(tag: HTMLCanvasElement, count: number) {
  const gap = 3 * DPM
  const perRow = Math.max(1, Math.floor((ROLL_W + gap) / (tag.width + gap)))
  const n = Math.max(1, Math.min(perRow, count))
  const { c, ctx } = blank(ROLL_W, tag.height + 2 * DPM)
  const total = n * tag.width + (n - 1) * gap
  const x0 = Math.max(0, (ROLL_W - total) / 2)
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (tag.width + gap)
    ctx.drawImage(tag, x, DPM)
    ctx.setLineDash([10, 7]); ctx.lineWidth = 2; ctx.strokeRect(x - 1, DPM - 1, tag.width + 2, tag.height + 2); ctx.setLineDash([])
  }
  return { canvas: c, perRow }
}

/** Product price label, full roll width; height follows the content. */
export function drawProductLabel(p: ProductLabel, priceSize: PriceSize, logo: HTMLCanvasElement | null, bizName: string, showLogo: boolean) {
  const W = ROLL_W, pad = 4 * DPM, iw = W - 2 * pad
  const meas = blank(10, 10).ctx
  meas.font = `700 40px ${FONT}`
  const lines = wrap(meas, p.name.trim() || '—', iw).slice(0, 3)
  const ps = { m: 64, l: 96, xl: 130 }[priceSize]
  const code = p.barcode.trim()
  const bc = p.showBarcode && code ? barcodeCanvas(code) : null
  const hasLogo = showLogo && (logo || bizName)
  const h = pad + (hasLogo ? 14 * DPM : 0) + lines.length * 48 + ps + 3 * DPM + (bc ? bc.height + 2 * DPM : 0) + 2 * DPM
  const { c, ctx } = blank(W, h)
  ctx.direction = 'rtl'
  let y = pad
  if (hasLogo) { drawLogo(ctx, logo, bizName, W / 2, y, W - 16 * DPM, 11 * DPM); y += 12 * DPM; ctx.fillRect(pad, y, iw, 2); y += 2 * DPM }
  ctx.font = `700 40px ${FONT}`
  for (const l of lines) { ctx.fillText(l, W / 2, y + 38); y += 48 }
  const price = p.price.trim() ? '₪' + Number(p.price).toLocaleString('he-IL') : '—'
  const fs = fit(ctx, price, 800, ps, iw)
  ctx.fillText(price, W / 2, y + fs * .92); y += ps + 3 * DPM
  if (bc) ctx.drawImage(bc, (W - Math.min(bc.width, iw)) / 2, y, Math.min(bc.width, iw), bc.height)
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
function barcodeCanvas(code: string): HTMLCanvasElement | null {
  const opts = { height: 10 * DPM, fontSize: 26, margin: 0, font: 'IBM Plex Mono', background: '#ffffff', lineColor: '#000000' }
  const tryOne = (format: string, width: number) => {
    const c = document.createElement('canvas')
    try { JsBarcode(c, code, { ...opts, format, width }); return c } catch { return null }
  }
  return (/^\d{13}$/.test(code) ? tryOne('EAN13', 3) : null) ?? tryOne('CODE128', code.length > 14 ? 2 : 3) ?? tryOne('CODE128', 2)
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
