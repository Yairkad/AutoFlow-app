import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/yard/return  { type: 'tire'|'product', id, qty, supplier }
// Items sent back to a supplier (wrong delivery etc.): stock goes down and the movement is logged
// as a NEGATIVE incoming movement ('order', source 'return'), so "how much we received" reports
// net it out and the stock screen can show / undo it. The supplier credit note is entered by hand.
export async function POST(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const { type, id, qty, supplier } = await req.json() as { type: 'tire' | 'product'; id: string; qty: number; supplier: string }
  const n = Math.round(Number(qty))
  const name = typeof supplier === 'string' ? supplier.trim() : ''
  if ((type !== 'tire' && type !== 'product') || !id || !(n > 0) || !name) {
    return new Response('Bad Request', { status: 400 })
  }

  const sb  = createServiceClient()
  const tbl = type === 'tire' ? 'tires' : 'products'
  const { data: cur } = await sb.from(tbl).select('qty').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!cur) return new Response('Not Found', { status: 404 })

  const newQty = Math.max(0, (cur.qty ?? 0) - n)
  const { error } = await sb.from(tbl).update({ qty: newQty }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return new Response('DB Error', { status: 500 })

  const mv = { tenant_id: tenantId, [type === 'tire' ? 'tire_id' : 'product_id']: id, qty: -n,
    movement_type: 'order', source: 'return', note: `הוחזר לספק: ${name}` }
  const { error: mvErr } = await sb.from(type === 'tire' ? 'tire_sales' : 'product_sales').insert(mv)
  if (mvErr) console.error('[yard/return] movement log failed', mvErr.message)

  return NextResponse.json({ qty: newQty })
}
