import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { tireSizeText } from '@/lib/tires/size'
import { brandHe, brandMap } from '@/lib/tires/brands'
import type { SearchResult } from '@/app/api/yard/search/route'

// Same barcode as the scanner may read it: case, a dropped/added leading zero (EAN-13 vs UPC-A)
function codeVariants(code: string): string[] {
  const noZeros = code.replace(/^0+/, '')
  return [...new Set([code, code.toUpperCase(), code.toLowerCase(), noZeros, `0${noZeros}`].filter(Boolean))]
}

// Several records with one barcode = duplicates. Pick the most complete one (has a price,
// then has stock) and report how many share the code so the screen can warn.
function best<T extends { sell_price: number | null; qty: number | null }>(rows: T[]): T {
  return [...rows].sort((a, b) =>
    Number((b.sell_price ?? 0) > 0) - Number((a.sell_price ?? 0) > 0) || (b.qty ?? 0) - (a.qty ?? 0))[0]
}

// GET /api/yard/barcode?code=XXXXX — exact barcode/SKU match across tires and products
export async function GET(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const code = req.nextUrl.searchParams.get('code')?.trim()
  if (!code) return NextResponse.json(null)
  const codes = codeVariants(code)

  const sb = createServiceClient()

  const TIRE_COLS = 'id,brand,width,profile,rim,speed_idx,load_idx,sell_price,qty,sku,location'
  const bySkuRes = await sb
    .from('tires')
    .select(TIRE_COLS)
    .eq('tenant_id', tenantId)
    .in('sku', codes)
  if (bySkuRes.error) console.error('[yard/barcode] tires', bySkuRes.error.message)
  let tires = bySkuRes.data
  // Extra barcodes of the same tire (a maker may print a different code each batch)
  if (!tires?.length) {
    const alt = await sb.from('tires').select(TIRE_COLS).eq('tenant_id', tenantId).overlaps('alt_barcodes', codes)
    if (!alt.error) tires = alt.data
  }

  if (tires?.length) {
    const tire = best(tires)
    const size = tireSizeText(tire, '/') || 'ללא מידה'
    const { data: brandRows } = await sb.from('tire_brands').select('name_en, name_he').eq('tenant_id', tenantId)
    const he = brandHe(brandMap(brandRows), tire.brand)
    const result: SearchResult = {
      id:    tire.id,
      type:  'tire',
      name:  `${he ?? tire.brand ?? ''} ${size} ${tire.speed_idx ?? ''}${tire.load_idx ?? ''}`.trim(),
      sku:   tire.sku ?? null,
      price: tire.sell_price ?? 0,
      stock: tire.qty,
      size,
      brand: tire.brand ?? undefined,
      location: tire.location ?? undefined,
      ...(he && tire.brand ? { brand_en: tire.brand } : {}),
      ...(tires.length > 1 ? { dup_count: tires.length } : {}),
    }
    return NextResponse.json(result)
  }

  // Products: the barcode may be saved in either field (ברקוד or מק"ט)
  const [byBarcode, bySku] = await Promise.all([
    sb.from('products').select('id,name,sku,barcode,sell_price,qty').eq('tenant_id', tenantId).in('barcode', codes),
    sb.from('products').select('id,name,sku,barcode,sell_price,qty').eq('tenant_id', tenantId).in('sku', codes),
  ])
  if (byBarcode.error) console.error('[yard/barcode] products', byBarcode.error.message)
  if (bySku.error) console.error('[yard/barcode] products sku', bySku.error.message)
  let prods = [...new Map([...(byBarcode.data ?? []), ...(bySku.data ?? [])].map(p => [p.id, p])).values()]
  if (!prods.length) {
    const alt = await sb.from('products').select('id,name,sku,barcode,sell_price,qty').eq('tenant_id', tenantId).overlaps('alt_barcodes', codes)
    if (!alt.error) prods = alt.data ?? []
  }

  if (prods.length) {
    const prod = best(prods)
    const result: SearchResult = {
      id:    prod.id,
      type:  'product',
      name:  prod.name,
      sku:   prod.sku ?? null,
      price: prod.sell_price ?? 0,
      stock: prod.qty,
      ...(prods.length > 1 ? { dup_count: prods.length } : {}),
    }
    return NextResponse.json(result)
  }

  return NextResponse.json(null)
}
