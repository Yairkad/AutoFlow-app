// Google Drive API v3 helpers (server-side only)

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_URL = 'https://www.googleapis.com/drive/v3'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  thumbnailLink?: string
  webViewLink?: string
}

// ── OAuth ──────────────────────────────────────────────────────────────────

export function getOAuthUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive.file',
    access_type:   'offline',
    prompt:        'consent',
    state:         tenantId,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to exchange code: ' + JSON.stringify(data))
  return data
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token:  refreshToken,
      client_id:      process.env.GOOGLE_CLIENT_ID!,
      client_secret:  process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:     'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to refresh token')
  return data.access_token
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) meta.parents = [parentId]
  const res = await fetch(`${DRIVE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  const data = await res.json()
  if (!data.id) throw new Error('Failed to create folder: ' + JSON.stringify(data))
  return data.id
}

// Find folder by name inside parent (returns first match or null)
export async function findFolder(accessToken: string, name: string, parentId: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const res = await fetch(`${DRIVE_URL}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

// Get or create folder by name inside parent
export async function getOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId)
  if (existing) return existing
  return createFolder(accessToken, name, parentId)
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadFile(
  accessToken: string,
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  folderId?: string | null,
): Promise<DriveFile> {
  const metaObj: Record<string, unknown> = { name: fileName }
  if (folderId) metaObj.parents = [folderId]
  const meta = JSON.stringify(metaObj)
  const boundary = 'autoflow_boundary'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(meta),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(`${UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,thumbnailLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  })
  const data = await res.json()
  if (!data.id) throw new Error('Upload failed: ' + JSON.stringify(data))

  // Make file publicly readable (so thumbnails work without auth)
  await fetch(`${DRIVE_URL}/files/${data.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })

  return data
}

// ── List / Delete ──────────────────────────────────────────────────────────

export async function listFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed=false`
  const fields = 'files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink)'
  const res = await fetch(`${DRIVE_URL}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime desc`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return data.files ?? []
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  await fetch(`${DRIVE_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

// ── Setup root folders ─────────────────────────────────────────────────────

export async function setupRootFolders(accessToken: string, businessName: string): Promise<string> {
  // Create root folder named after the business
  const rootId = await createFolder(accessToken, `AutoFlow – ${businessName}`)

  // Create sub-folders
  await Promise.all([
    createFolder(accessToken, 'רכבים', rootId),
    createFolder(accessToken, 'בדיקות קניה', rootId),
    createFolder(accessToken, 'מסמכים', rootId),
  ])

  return rootId
}
