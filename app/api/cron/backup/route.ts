import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { backupTenantToDrive } from '@/lib/backup/driveBackup'

// 60s = the Vercel Hobby limit (a higher value fails the deploy). Enough for one business.
export const maxDuration = 60

// Daily automatic backup (Vercel Cron, see vercel.json) of every business that connected Drive.
// Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set the route refuses.
//
// Each business is backed up in its OWN invocation (?tenant=<id>), so every one gets the full 60s.
// Backing them all up one after another in a single 60s call timed out once there were several
// businesses: the function was killed mid-loop, the rest got no backup and no error was recorded.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret) {
    console.error('cron backup: CRON_SECRET is not set in the Vercel project env — refusing')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()
  const tenantId = req.nextUrl.searchParams.get('tenant')

  // ── One business ──────────────────────────────────────────────────────────
  if (tenantId) {
    try {
      const res = await backupTenantToDrive(sb, tenantId, 'auto')
      return NextResponse.json({ tenant: tenantId, ok: true, name: res.name })
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
      console.error(`auto backup failed for ${tenantId}:`, msg)
      await sb.from('tenants').update({ last_backup_error: `${new Date().toISOString()} ${msg}` }).eq('id', tenantId)
      return NextResponse.json({ tenant: tenantId, ok: false, error: msg }, { status: 500 })
    }
  }

  // ── Fan out: one invocation per business, in parallel ─────────────────────
  const { data: tenants, error } = await sb.from('tenants')
    .select('id').not('drive_refresh_token', 'is', null).not('drive_root_folder_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = await Promise.all((tenants ?? []).map(async t => {
    const url = new URL(req.nextUrl.pathname, req.nextUrl.origin)
    url.searchParams.set('tenant', t.id)
    try {
      const r = await fetch(url, { headers: { authorization: auth }, cache: 'no-store' })
      const body = await r.json().catch(() => ({}))
      return { tenant: t.id, ok: r.ok, ...(r.ok ? {} : { error: body.error ?? `HTTP ${r.status}` }) }
    } catch (e) {
      // The child invocation may still finish and record its own result — this only means we lost the reply.
      return { tenant: t.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }))
  return NextResponse.json({ results })
}
