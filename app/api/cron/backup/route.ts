import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { backupTenantToDrive } from '@/lib/backup/driveBackup'

export const maxDuration = 300

// Daily automatic backup (Vercel Cron, see vercel.json) of every business that connected Drive.
// Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set the route refuses.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()
  const { data: tenants, error } = await sb.from('tenants')
    .select('id').not('drive_refresh_token', 'is', null).not('drive_root_folder_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { tenant: string; ok: boolean; error?: string }[] = []
  for (const t of tenants ?? []) {
    try {
      await backupTenantToDrive(sb, t.id, 'auto')
      results.push({ tenant: t.id, ok: true })
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
      console.error(`auto backup failed for ${t.id}:`, msg)
      await sb.from('tenants').update({ last_backup_error: `${new Date().toISOString()} ${msg}` }).eq('id', t.id)
      results.push({ tenant: t.id, ok: false, error: msg })
    }
  }
  return NextResponse.json({ results })
}
