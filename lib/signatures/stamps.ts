// Signatures and stamps (table signature_stamps, migration 119) used on the signed inspection PDF.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StampKind = 'stamp' | 'signature'
export interface SignatureStamp {
  id: string
  kind: StampKind
  name: string
  image: string          // transparent PNG data URL
  is_default: boolean
}

export const STAMP_KIND_LABEL: Record<StampKind, string> = { stamp: 'חותמת', signature: 'חתימה' }

export async function loadSignatureStamps(sb: SupabaseClient, tenantId: string): Promise<SignatureStamp[]> {
  const { data } = await sb.from('signature_stamps')
    .select('id, kind, name, image, is_default')
    .eq('tenant_id', tenantId)
    .order('created_at')
  return (data ?? []) as SignatureStamp[]
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image()
  img.onload = () => res(img)
  img.onerror = rej
  img.src = src
})

/**
 * Scanned/photographed stamp or signature → transparent PNG: paper (light pixels) becomes
 * transparent with a soft edge, ink keeps its colour; cropped to the ink and capped at maxPx.
 */
export async function cleanStampImage(file: File | string, maxPx = 700): Promise<string> {
  const src = typeof file === 'string' ? file : URL.createObjectURL(file)
  try {
    const img = await loadImg(src)
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    const px = data.data
    const HI = 215, LO = 140         // lum ≥ HI → paper (transparent); ≤ LO → full ink
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        const a = lum >= HI ? 0 : lum <= LO ? 255 : Math.round(255 * (HI - lum) / (HI - LO))
        px[i + 3] = Math.min(px[i + 3], a)
        if (a > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
      }
    }
    ctx.putImageData(data, 0, 0)
    if (maxX < 0) throw new Error('empty')
    const pad = 6
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad)
    const cw = maxX - minX + 1, ch = maxY - minY + 1
    const s2 = Math.min(1, maxPx / Math.max(cw, ch))
    const out = document.createElement('canvas')
    out.width = Math.round(cw * s2); out.height = Math.round(ch * s2)
    out.getContext('2d')!.drawImage(c, minX, minY, cw, ch, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(src)
  }
}
