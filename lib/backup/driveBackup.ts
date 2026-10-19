import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessToken, getOrCreateFolder, listFilesOnly, deleteFile, uploadFile } from '@/lib/drive'
import { buildBackup, backupFileName, markBackup } from './backup'

export const DRIVE_BACKUP_FOLDER = 'גיבויים'
// Daily backups kept in Drive; older ones are deleted after a successful upload.
export const DRIVE_BACKUPS_KEPT = 30

export class DriveNotConnectedError extends Error {}

/** Builds a full backup and uploads it — PRIVATE — to "<root>/גיבויים" in the tenant's Drive. */
export async function backupTenantToDrive(sb: SupabaseClient, tenantId: string, kind: 'drive' | 'auto') {
  const { data: tenant } = await sb.from('tenants')
    .select('drive_refresh_token, drive_root_folder_id').eq('id', tenantId).maybeSingle()
  if (!tenant?.drive_refresh_token || !tenant.drive_root_folder_id) throw new DriveNotConnectedError('Drive לא מחובר')

  const backup = await buildBackup(sb, tenantId)
  const token  = await getAccessToken(tenant.drive_refresh_token)
  const folder = await getOrCreateFolder(token, DRIVE_BACKUP_FOLDER, tenant.drive_root_folder_id)
  const file   = await uploadFile(token, Buffer.from(JSON.stringify(backup)), 'application/json', backupFileName(), folder, { public: false })

  // Retention — only after the new upload succeeded.
  try {
    const files = (await listFilesOnly(token, folder))
      .filter(f => f.name.startsWith('גיבוי_') && f.name.endsWith('.json'))
      .sort((a, b) => (b.createdTime ?? b.name).localeCompare(a.createdTime ?? a.name))
    for (const old of files.slice(DRIVE_BACKUPS_KEPT)) await deleteFile(token, old.id)
  } catch (e) {
    console.error('backup retention cleanup failed:', e)
  }

  await markBackup(sb, tenantId, kind)
  return { fileId: file.id, name: file.name, counts: backup._counts }
}
