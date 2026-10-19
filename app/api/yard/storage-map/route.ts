import { NextRequest, NextResponse } from 'next/server'
import { getYardUser } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { loadLayout } from '@/lib/stock/server'
import { lastCountByCabinet, validateLayout, type StorageLayout } from '@/lib/stock/storage'

// GET /api/yard/storage-map — the cabinets map + when each cabinet was last counted (yard + office)
export async function GET() {
  const user = await getYardUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createServiceClient()
  const [{ layout, saved }, { data: sessions }] = await Promise.all([
    loadLayout(sb, user.tenantId),
    sb.from('tire_inventory_count_sessions').select('counted_at, zone').eq('tenant_id', user.tenantId)
      .order('counted_at', { ascending: false }).limit(500),
  ])
  return NextResponse.json({ layout, saved, lastCount: lastCountByCabinet(layout, sessions ?? []) })
}

// PUT /api/yard/storage-map { layout } — office admin only
export async function PUT(req: NextRequest) {
  const user = await getYardUser()
  if (!user || user.employeeId || !user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { layout } = await req.json().catch(() => ({})) as { layout?: StorageLayout }
  const err = layout ? validateLayout(layout) : 'חסר תרשים'
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { error } = await createServiceClient().from('storage_maps')
    .upsert({ tenant_id: user.tenantId, layout, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
