import { NextRequest, NextResponse } from 'next/server'
import { getYardUser, type YardUser } from '@/lib/auth/yard-token'
import { canYard } from '@/lib/yard/access'
import { createServiceClient } from '@/lib/supabase/service'
import { selectAll } from '@/lib/supabase/selectAll'
import { loadLayout } from '@/lib/stock/server'
import { parseLocation } from '@/lib/stock/storage'
import { ROUND_DAYS, ROUND_MARK_NOTE, type CountRound, type ZoneCountSave, type ZoneTire } from '@/lib/stock/zoneCount'

// Yard employees with the count section, office users who manage tires
async function guard(): Promise<{ error: NextResponse } | { user: YardUser }> {
  const user = await getYardUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const office = !user.employeeId && user.modules.includes('tires')
  if (!canYard(user, 'yard_count') && !office) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// GET /api/yard/zone-count — map + every tire (with location) for counting by cabinet / shelf,
// and which shelves were already counted in the current round
export async function GET() {
  const auth = await guard()
  if ('error' in auth) return auth.error
  const sb = createServiceClient()
  const tid = auth.user.tenantId
  const [{ layout }, tires, round] = await Promise.all([
    loadLayout(sb, tid),
    selectAll<ZoneTire>((a, b) => sb.from('tires')
      .select('id, sku, brand, width, profile, rim, qty, location').eq('tenant_id', tid).order('id').range(a, b)),
    loadRound(sb, tid),
  ])
  if (tires.error) return NextResponse.json({ error: tires.error.message }, { status: 500 })
  if ('error' in round) return NextResponse.json({ error: round.error }, { status: 500 })
  return NextResponse.json({ layout, tires: tires.data, round })
}

// Zone counts of the last ROUND_DAYS days after the latest "new round" mark; each shelf keeps its
// latest count + the tires found on it then (to spot sizes that changed since).
async function loadRound(sb: ReturnType<typeof createServiceClient>, tid: string): Promise<CountRound | { error: string }> {
  let since = new Date(Date.now() - ROUND_DAYS * 86_400_000).toISOString()
  const { data: sessions, error } = await sb.from('tire_inventory_count_sessions')
    .select('id, counted_at, zone, counted_by_name').eq('tenant_id', tid).not('zone', 'is', null)
    .gte('counted_at', since).order('counted_at', { ascending: false }).limit(500)
  if (error) return { error: error.message }

  const shelves: CountRound['shelves'] = {}
  const sessionOf: Record<string, string> = {}
  let startedAt: string | null = null
  for (const s of sessions ?? []) {
    if (!s.zone?.length) { startedAt = s.counted_at; since = s.counted_at; break }
    for (const shelf of s.zone as string[]) {
      if (shelves[shelf]) continue
      shelves[shelf] = { at: s.counted_at, by: s.counted_by_name, tireIds: [] }
      sessionOf[shelf] = s.id
    }
  }

  const ids = [...new Set(Object.values(sessionOf))]
  if (ids.length) {
    const entries = await selectAll<{ session_id: string; tire_id: string | null; location: string | null; counted_qty: number }>((a, b) =>
      sb.from('tire_inventory_count_entries').select('session_id, tire_id, location, counted_qty')
        .in('session_id', ids).order('id').range(a, b))
    if (entries.error) return { error: entries.error.message }
    for (const e of entries.data) {
      if (!e.tire_id || e.counted_qty <= 0) continue
      for (const shelf of parseLocation(e.location)) {
        if (sessionOf[shelf] === e.session_id) shelves[shelf].tireIds.push(e.tire_id)
      }
    }
  }
  return { since, startedAt, shelves }
}

// PUT /api/yard/zone-count — start a new count round (every shelf goes back to "not counted")
export async function PUT() {
  const auth = await guard()
  if ('error' in auth) return auth.error
  const { error } = await createServiceClient().from('tire_inventory_count_sessions').insert({
    tenant_id: auth.user.tenantId, notes: ROUND_MARK_NOTE, is_first: false, zone: [], counted_by_name: auth.user.name,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
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
