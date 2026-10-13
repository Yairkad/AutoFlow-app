import sharp from 'sharp'

export interface LogoPalette { bg: string; accent: string }

const FALLBACK: LogoPalette = { bg: '#0e5c55', accent: '#a7f3d0' }

function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}
function lum(r: number, g: number, b: number) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
function sat(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** Most common colour bucket among pixels matching `keep`, averaged. */
function dominant(px: Buffer, keep: (r: number, g: number, b: number) => boolean) {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < px.length; i += 3) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    if (!keep(r, g, b)) continue
    const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    buckets.set(key, e)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e
  return best && best.n >= 8 ? [best.r / best.n, best.g / best.n, best.b / best.n] as const : null
}

/**
 * Background = the logo's dominant dark colour (white text must stay readable on it),
 * accent = its dominant bright, saturated colour (white if it has none).
 */
export async function logoPalette(logo: Buffer): Promise<LogoPalette> {
  try {
    const px = await sharp(logo).flatten({ background: '#ffffff' }).resize(64, 64, { fit: 'inside' }).removeAlpha().raw().toBuffer()
    const isWhiteish = (r: number, g: number, b: number) => Math.min(r, g, b) > 215
    let dark = dominant(px, (r, g, b) => !isWhiteish(r, g, b) && lum(r, g, b) < 0.45 && (sat(r, g, b) > 0.25 || lum(r, g, b) < 0.2))
    // Logo with only light/mid colours: take its most saturated colour and darken it.
    dark ??= dominant(px, (r, g, b) => !isWhiteish(r, g, b) && sat(r, g, b) > 0.3)
    if (!dark) return FALLBACK
    let [r, g, b] = dark
    while (lum(r, g, b) > 0.32) { r *= 0.8; g *= 0.8; b *= 0.8 }
    const bg = hex(r, g, b)

    const bright = dominant(px, (r2, g2, b2) => lum(r2, g2, b2) > 0.45 && sat(r2, g2, b2) > 0.4
      && Math.abs(r2 - r) + Math.abs(g2 - g) + Math.abs(b2 - b) > 160)
    return { bg, accent: bright ? hex(...bright) : '#ffffff' }
  } catch {
    return FALLBACK
  }
}
