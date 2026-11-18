// ESC/POS job builder for continuous printing on a roll with an auto-cutter.
//
// The cutter sits `gap` mm past the print head, so a plain "feed to cutter + cut" after every label
// leaves `gap` mm of blank paper at the top of the next one. In a continuous job we instead print the
// labels back to back and send each cut (without feeding) only once the boundary between two labels
// has travelled `gap` mm, i.e. when it's under the knife — no blank paper between labels.
// Images go out as GS v 0 raster, row-exact (no 24-dot band padding), so cut positions stay precise.

import { DPM, ROLL_MM } from '@/lib/print/labels'

const W_DOTS = ROLL_MM * DPM           // 576
const W_BYTES = W_DOTS / 8              // 72
const BAND = 200                        // rows per GS v 0 command (keeps each command small)

const INIT = [0x1b, 0x40]               // ESC @
const CUT_HERE = [0x1d, 0x56, 0x01]     // GS V 1 — partial cut, no feed
const FEED_CUT = [0x1d, 0x56, 0x42, 0]  // GS V 66 0 — feed to the cutter, then partial cut

/** 1-bit rows (black = luminance < 128) of a canvas `W_DOTS` wide. */
function bitRows(c: HTMLCanvasElement): Uint8Array {
  const h = c.height, w = Math.min(c.width, W_DOTS)
  const px = c.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = new Uint8Array(W_BYTES * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11 < 128) out[y * W_BYTES + (x >> 3)] |= 0x80 >> (x & 7)
  }
  return out
}

class Job {
  private parts: number[][] = []
  private rows: Uint8Array[] = []         // pending raster rows (each W_BYTES)
  raw(b: number[]) { this.flush(); this.parts.push(b) }
  row(r: Uint8Array) { this.rows.push(r) }
  blank(n: number) { const z = new Uint8Array(W_BYTES); for (let i = 0; i < n; i++) this.rows.push(z) }
  private flush() {
    for (let i = 0; i < this.rows.length; i += BAND) {
      const band = this.rows.slice(i, i + BAND), h = band.length
      const cmd = [0x1d, 0x76, 0x30, 0, W_BYTES & 0xff, W_BYTES >> 8, h & 0xff, h >> 8]
      const body = new Array<number>(h * W_BYTES)
      band.forEach((r, j) => { for (let k = 0; k < W_BYTES; k++) body[j * W_BYTES + k] = r[k] })
      this.parts.push(cmd, body)
    }
    this.rows = []
  }
  base64() {
    this.flush()
    let s = ''
    for (const p of this.parts) for (let i = 0; i < p.length; i += 8192) s += String.fromCharCode(...p.slice(i, i + 8192))
    return btoa(s)
  }
}

/**
 * One job for all labels. gapMm = head-to-cutter distance (from the calibration label).
 * Cut k happens when (end of label k) + gap has been printed; past the last row we feed blank rows.
 */
export function continuousJob(labels: HTMLCanvasElement[], gapMm: number): string {
  const gap = Math.round(gapMm * DPM)
  const strip = labels.map(bitRows)
  const heights = labels.map(c => c.height)
  const total = heights.reduce((a, b) => a + b, 0)
  const rowAt = (y: number) => { for (let k = 0, o = 0; k < strip.length; o += heights[k++]) if (y < o + heights[k]) return strip[k].subarray((y - o) * W_BYTES, (y - o + 1) * W_BYTES); return null }

  const job = new Job()
  job.raw(INIT)
  let pos = 0
  const advanceTo = (target: number) => {
    for (; pos < target; pos++) { const r = rowAt(pos); if (r) job.row(r); else job.blank(1) }
  }
  let boundary = 0
  for (let k = 0; k < heights.length - 1; k++) {
    boundary += heights[k]
    advanceTo(boundary + gap)
    job.raw(CUT_HERE)
  }
  if (pos <= total) { advanceTo(total); job.raw(FEED_CUT) }
  else { advanceTo(total + gap); job.raw(CUT_HERE) }
  return job.base64()
}

/**
 * Calibration: a ruler numbered in mm from its LAST printed row, cut right away without feeding.
 * The knife is `gap` mm behind the head, so the number at the cut edge is the gap. The leftover
 * piece is then fed out and cut normally.
 */
export function calibrationJob(): string {
  const H = 60 * DPM
  const c = document.createElement('canvas'); c.width = W_DOTS; c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#fff'; x.fillRect(0, 0, W_DOTS, H); x.fillStyle = '#000'
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 22px Arial'
  x.direction = 'rtl'; x.fillText('כיול סכין: המספר בקו החיתוך = המרחק', W_DOTS / 2, 16)
  x.direction = 'ltr'
  for (let mm = 0; mm < 56; mm++) {
    const y = H - 1 - mm * DPM
    const len = mm % 5 === 0 ? 150 : 60
    x.fillRect(0, y - 1, len, 3); x.fillRect(W_DOTS - len, y - 1, len, 3)
    if (mm % 5 === 0 && mm > 0) { x.font = '700 40px Arial'; x.fillText(String(mm), W_DOTS / 2, y) }
    else if (mm > 0) { x.font = '500 18px Arial'; x.fillText(String(mm), W_DOTS / 2 - 120, y); x.fillText(String(mm), W_DOTS / 2 + 120, y) }
  }
  const job = new Job()
  job.raw(INIT)
  const rows = bitRows(c)
  for (let y = 0; y < H; y++) job.row(rows.subarray(y * W_BYTES, (y + 1) * W_BYTES))
  job.raw(CUT_HERE)      // cut through the ruler at the knife → reading = gap
  job.raw(FEED_CUT)      // feed the rest out
  return job.base64()
}

/** Three short numbered labels in one continuous job — the cuts should fall between them. */
export function testLabels(): HTMLCanvasElement[] {
  return [1, 2, 3].map(n => {
    const c = document.createElement('canvas'); c.width = W_DOTS; c.height = 12 * DPM
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'
    x.lineWidth = 4; x.strokeRect(2, 2, c.width - 4, c.height - 4)
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 60px Arial'
    x.direction = 'rtl'; x.fillText(`מדבקה ${n}`, c.width / 2, c.height / 2)
    return c
  })
}
