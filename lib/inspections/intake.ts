// Shared definitions for the purchase-inspection pre-fill flow (customer link → office).

export type IntakeStatus = 'link_sent' | 'submitted' | 'arrived'

export type IntakeFileKind = 'buyer_id' | 'seller_id' | 'car_license'

export interface IntakeFile {
  kind: IntakeFileKind
  path: string          // object path inside the `inspection-intake` storage bucket
  name: string          // original file name
  type: string          // mime type
  uploaded_at: string
}

export const INTAKE_BUCKET = 'inspection-intake'
// Each file is posted in its own request; Vercel rejects request bodies above ~4.5MB.
export const INTAKE_MAX_FILE_BYTES = 4 * 1024 * 1024

// label/hint = customer form; bring = "bring it physically" note for the customer; office = office screen name
export const INTAKE_FILE_KINDS: { kind: IntakeFileKind; label: string; hint: string; bring: string; office: string }[] = [
  { kind: 'buyer_id',    label: 'תעודת זהות שלך',      hint: 'צילום ברור של הצד עם התמונה', bring: 'תעודת זהות',                        office: 'ת.ז קונה' },
  { kind: 'seller_id',   label: 'תעודת זהות של המוכר', hint: 'אם יש לך',                    bring: 'תעודת זהות של המוכר (אם רלוונטי)', office: 'ת.ז מוכר' },
  { kind: 'car_license', label: 'רישיון רכב',          hint: 'צילום ברור',                  bring: 'רישיון רכב (מקור)',                 office: 'רישיון רכב' },
]

export const intakeFileLabel = (kind: IntakeFileKind) =>
  INTAKE_FILE_KINDS.find(k => k.kind === kind)?.office ?? kind

/** Optional data the customer didn't provide — must be completed when they arrive. */
export function intakeMissing(row: {
  owner_address?: string | null
  km?: string | null
  intake_files?: IntakeFile[] | null
}): string[] {
  const files = row.intake_files ?? []
  const has = (k: IntakeFileKind) => files.some(f => f.kind === k)
  const missing: string[] = []
  if (!row.owner_address?.trim()) missing.push('כתובת')
  if (!row.km?.trim())            missing.push('ק"מ')
  if (!has('buyer_id'))           missing.push('ת.ז קונה')
  if (!has('seller_id'))          missing.push('ת.ז מוכר')
  if (!has('car_license'))        missing.push('רישיון רכב')
  return missing
}

// Uploaded documents are deleted this many days after the customer arrived (or, if they never
// arrived, after they submitted the form). Stated in the privacy policy — keep both in sync.
export const INTAKE_FILE_RETENTION_DAYS = 30

export function newIntakeToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
