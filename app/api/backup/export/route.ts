import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createServiceClient } from '@/lib/supabase/service'
import { buildBackup, backupFileName, markBackup } from '@/lib/backup/backup'

export const maxDuration = 60

// Admin: download a full backup of the business as a JSON file.
export async function GET() {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error
  const sb = createServiceClient()
  try {
    const backup = await buildBackup(sb, auth.profile.tenant_id)
    await markBackup(sb, auth.profile.tenant_id, 'download')
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(backupFileName())}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('backup export failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}
