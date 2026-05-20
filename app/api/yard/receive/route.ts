import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/yard/receive
// { type: 'tire'|'product', id: string, qty_add: number }
// Increments stock and returns new qty
export async function POST(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { type, id, qty_add } = body as { type: 'tire' | 'product'; id: string; qty_add: number }

  if (!type || !id || !qty_add || qty_add <= 0) {
    return new Response('Bad Request', { status: 400 })
  }

  const sb   = createServiceClient()
  const tbl  = type === 'tire' ? 'tires' : 'products'

  const { data: current } = await sb
    .from(tbl)
    .select('qty')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!current) return new Response('Not Found', { status: 404 })

  const newQty = (current.qty ?? 0) + qty_add

  const { error } = await sb
    .from(tbl)
    .update({ qty: newQty })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return new Response('DB Error', { status: 500 })

  return NextResponse.json({ qty: newQty })
}

// POST /api/yard/receive/tire — create a new tire and set initial stock
// Handled via the same route with type + full tire fields
export async function PUT(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const sb   = createServiceClient()
  const body = await req.json()

  const { type, qty, ...fields } = body as {
    type: 'tire' | 'product'
    sku: string
    qty: number
    // tire fields
    brand?: string; width?: number; profile?: number; rim?: number
    sell_price?: number; cost_price?: number
    // product fields
    name?: string
  }

  if (type === 'tire') {
    const { data, error } = await sb
      .from('tires')
      .insert({ tenant_id: tenantId, qty: qty ?? 1, ...fields })
      .select('id,brand,width,profile,rim,sell_price,qty,sku')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    return NextResponse.json(data)
  } else {
    const { data, error } = await sb
      .from('products')
      .insert({ tenant_id: tenantId, qty: qty ?? 1, unit: 'יח׳', ...fields })
      .select('id,name,sell_price,qty,sku')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    return NextResponse.json(data)
  }
}
