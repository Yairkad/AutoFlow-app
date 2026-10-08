import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createServiceClient } from '@/lib/supabase/service'
import { backupTenantToDrive, DriveNotConnectedError } from '@/lib/backup/driveBackup'

export const maxDuration = 60

// Admin: "back up to Drive now".
export async function POST() {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error
  try {
    const res = await backupTenantToDrive(createServiceClient(), auth.profile.tenant_id, 'drive')
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    if (e instanceof DriveNotConnectedError) return NextResponse.json({ error: 'יש לחבר Google Drive בהגדרות' }, { status: 400 })
    console.error('drive backup failed:', e)
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: /token/i.test(msg) ? 'חיבור Drive פג — חבר מחדש בהגדרות' : msg }, { status: 500 })
  }
}
