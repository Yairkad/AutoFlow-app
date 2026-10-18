import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { WAITING_STATUSES } from '@/lib/yard/hub'

type Sb = ReturnType<typeof createServiceClient>

// Every receive is logged as an incoming movement ('order') — the same log the tires/products
// pages already write — so the quick reports and "last receive date" can read it.
async function logReceipt(sb: Sb, tenantId: string, type: 'tire' | 'product', id: string, qty: number) {
  const { error } = type === 'tire'
    ? await sb.from('tire_sales').insert({ tenant_id: tenantId, tire_id: id, qty, movement_type: 'order' })
    : await sb.from('product_sales').insert({ tenant_id: tenantId, product_id: id, qty, movement_type: 'order' })
  if (error) console.error('[yard/receive] movement log failed', error.message)
}

// Customers waiting for this exact tire size — the receive screen offers to tell them
async function waitingFor(sb: Sb, tenantId: string, t: { width: number | null; profile: number | null; rim: number | null }) {
  if (!t.width || !t.profile || !t.rim) return []
  const { data } = await sb.from('customer_requests')
    .select('id, customer_name, phone, item_desc, qty')
    .eq('tenant_id', tenantId)
    .in('status', WAITING_STATUSES)
    .eq('tire_width', t.width).eq('tire_profile', t.profile).eq('tire_rim', t.rim)
    .order('created_at')
  return data ?? []
}

// POST /api/yard/receive
// { type: 'tire'|'product', id: string, qty_add: number, set_sku?: string }
// Increments stock and returns new qty. set_sku: an unknown barcode the user linked to this item
// and chose to keep as its SKU.
export async function POST(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { type, id, qty_add, set_sku } = body as { type: 'tire' | 'product'; id: string; qty_add: number; set_sku?: string }

  if (!type || !id || !qty_add || qty_add <= 0) {
    return new Response('Bad Request', { status: 400 })
  }

  const sb   = createServiceClient()
  const tbl  = type === 'tire' ? 'tires' : 'products'

  const { data: current } = await sb
    .from(tbl)
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!current) return new Response('Not Found', { status: 404 })

  const newQty = (current.qty ?? 0) + qty_add

  const { error } = await sb
    .from(tbl)
    .update({ qty: newQty, ...(typeof set_sku === 'string' && set_sku.trim() ? { sku: set_sku.trim() } : {}) })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return new Response('DB Error', { status: 500 })

  const [, waiting] = await Promise.all([
    logReceipt(sb, tenantId, type, id, qty_add),
    type === 'tire' ? waitingFor(sb, tenantId, current) : [],
  ])
  return NextResponse.json({ qty: newQty, waiting })
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
    const [, waiting] = await Promise.all([
      logReceipt(sb, tenantId, 'tire', data.id, data.qty),
      waitingFor(sb, tenantId, data),
    ])
    return NextResponse.json({ ...data, waiting })
  } else {
    const { data, error } = await sb
      .from('products')
      .insert({ tenant_id: tenantId, qty: qty ?? 1, unit: 'יח׳', ...fields })
      .select('id,name,sell_price,qty,sku')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    await logReceipt(sb, tenantId, 'product', data.id, data.qty)
    return NextResponse.json(data)
  }
}
