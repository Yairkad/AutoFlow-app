import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import type { SearchResult } from '@/app/api/yard/search/route'

// GET /api/yard/barcode?code=XXXXX — exact SKU match across tires and products
export async function GET(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const code = req.nextUrl.searchParams.get('code')?.trim()
  if (!code) return NextResponse.json(null)

  const sb = createServiceClient()

  const { data: tire } = await sb
    .from('tires')
    .select('id,brand,width,profile,rim,speed_idx,load_idx,sell_price,qty,sku')
    .eq('tenant_id', tenantId)
    .eq('sku', code)
    .maybeSingle()

  if (tire) {
    const size = `${tire.width}/${tire.profile}/${tire.rim}`
    const result: SearchResult = {
      id:    tire.id,
      type:  'tire',
      name:  `${tire.brand ?? ''} ${size} ${tire.speed_idx ?? ''}${tire.load_idx ?? ''}`.trim(),
      sku:   tire.sku ?? null,
      price: tire.sell_price ?? 0,
      stock: tire.qty,
      size,
      brand: tire.brand ?? undefined,
    }
    return NextResponse.json(result)
  }

  const { data: prod } = await sb
    .from('products')
    .select('id,name,sku,barcode,sell_price,qty')
    .eq('tenant_id', tenantId)
    .eq('barcode', code)
    .maybeSingle()

  if (prod) {
    const result: SearchResult = {
      id:    prod.id,
      type:  'product',
      name:  prod.name,
      sku:   prod.sku ?? null,
      price: prod.sell_price ?? 0,
      stock: prod.qty,
    }
    return NextResponse.json(result)
  }

  return NextResponse.json(null)
}
