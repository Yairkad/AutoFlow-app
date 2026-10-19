import { NextRequest, NextResponse } from 'next/server'
import { getYardUser, type YardUser } from '@/lib/auth/yard-token'
import { canYard } from '@/lib/yard/access'
import { createServiceClient } from '@/lib/supabase/service'
import { selectAll } from '@/lib/supabase/selectAll'
import { loadLayout } from '@/lib/stock/server'
import type { ZoneCountSave, ZoneTire } from '@/lib/stock/zoneCount'

// Yard employees with the count section, office users who manage tires
async function guard(): Promise<{ error: NextResponse } | { user: YardUser }> {
  const user = await getYardUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const office = !user.employeeId && user.modules.includes('tires')
  if (!canYard(user, 'yard_count') && !office) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// GET /api/yard/zone-count — map + every tire (with location) for counting by cabinet / shelf
export async function GET() {
  const auth = await guard()
  if ('error' in auth) return auth.error
  const sb = createServiceClient()
  const tid = auth.user.tenantId
  const [{ layout }, tires] = await Promise.all([
    loadLayout(sb, tid),
    selectAll<ZoneTire>((a, b) => sb.from('tires')
      .select('id, sku, brand, width, profile, rim, qty, location').eq('tenant_id', tid).order('id').range(a, b)),
  ])
  if (tires.error) return NextResponse.json({ error: tires.error.message }, { status: 500 })
  return NextResponse.json({ layout, tires: tires.data })
}

// POST /api/yard/zone-count — save a zone count. The client already decided every tire's
// new qty + location (it shows the user each decision); the server applies them and logs the session.
export async function POST(req: NextRequest) {
  const auth = await guard()
  if ('error' in auth) return auth.error
  const sb = createServiceClient()
  const tid = auth.user.tenantId
  const body = await req.json().catch(() => null) as ZoneCountSave | null
  if (!body || !Array.isArray(body.shelves) || !body.shelves.length || !Array.isArray(body.updates) || !Array.isArray(body.creates))
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  // Only this tenant's tires may be touched
  const ids = [...new Set(body.updates.map(u => u.tireId))]
  if (ids.length) {
    const { data: own, error } = await sb.from('tires').select('id').eq('tenant_id', tid).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((own ?? []).length !== ids.length) return NextResponse.json({ error: 'צמיג לא נמצא' }, { status: 400 })
  }

  // Unknown barcodes / tires without SKU become new tires (details filled in later on the tires page)
  const created: { id: string; c: ZoneCountSave['creates'][number] }[] = []
  for (const c of body.creates) {
    const { data, error } = await sb.from('tires').insert({
      tenant_id: tid, qty: Math.max(0, c.qty), sku: c.sku || null, location: c.location,
      width: c.width ?? null, profile: c.profile ?? null, rim: c.rim ?? null, brand: c.brand ?? null,
    }).select('id').single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה ביצירת צמיג' }, { status: 500 })
    created.push({ id: data.id, c })
  }

  const { data: session, error: sessErr } = await sb.from('tire_inventory_count_sessions').insert({
    tenant_id: tid, notes: body.notes?.trim() || null, is_first: false,
    zone: body.shelves, counted_by_name: auth.user.name,
  }).select('id').single()
  if (sessErr || !session) return NextResponse.json({ error: sessErr?.message ?? 'שגיאה בשמירה' }, { status: 500 })

  const entries = [
    ...body.updates.map(u => ({ session_id: session.id, tire_id: u.tireId, sku: u.sku || null, label: u.label,
      counted_qty: u.counted, system_qty: u.systemQty, expected_qty: null, location: u.location })),
    ...created.map(({ id, c }) => ({ session_id: session.id, tire_id: id, sku: c.sku || null, label: c.label,
      counted_qty: c.qty, system_qty: null, expected_qty: null, location: c.location })),
  ]
  const results = await Promise.all([
    entries.length ? sb.from('tire_inventory_count_entries').insert(entries) : Promise.resolve({ error: null }),
    ...body.updates.map(u => sb.from('tires').update({ qty: Math.max(0, u.qty), location: u.location }).eq('id', u.tireId).eq('tenant_id', tid)),
  ])
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: body.updates.length, created: created.length })
}
