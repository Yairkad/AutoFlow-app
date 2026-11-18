// Receipts / tax invoices for expenses: uploaded to the tenant's Drive under קבלות/<year>/<month>,
// named "<date> – <description> – <amount>₪.<ext>" (via /api/drive/upload).
import { MAX_UPLOAD_BYTES, shrinkForUpload } from '@/lib/utils/uploadCompress'

export interface ReceiptMeta { date: string; description: string; amount: number | null }
export interface DriveReceipt { id: string; name: string; url: string }

export function receiptFileName(m: ReceiptMeta, ext: string) {
  const desc = m.description.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
  const amt = m.amount != null && !isNaN(m.amount) ? `${Math.round(m.amount * 100) / 100}₪` : ''
  return [m.date, desc, amt].filter(Boolean).join(' – ') + ext
}

/** Shrink, name and upload one receipt. Throws with a Hebrew message on failure. */
export async function uploadReceipt(file: File, m: ReceiptMeta, tenantId: string): Promise<DriveReceipt> {
  const shrunk = await shrinkForUpload(file)
  if (shrunk.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ גדול מדי (מקסימום כ-4MB). נסו לסרוק באיכות נמוכה יותר.')
  const ext = shrunk.name.includes('.') ? shrunk.name.slice(shrunk.name.lastIndexOf('.')) : ''
  const named = new File([shrunk], receiptFileName(m, ext), { type: shrunk.type })
  const [y, mo] = (m.date || new Date().toISOString().slice(0, 10)).split('-')
  const fd = new FormData()
  fd.append('file', named)
  fd.append('tenant_id', tenantId)
  fd.append('sub_folder', 'קבלות')
  fd.append('item_name', y)
  fd.append('period_name', mo)
  const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
  if (res.status === 413) throw new Error('הקובץ גדול מדי להעלאה (מקסימום כ-4MB).')
  const data = await res.json().catch(() => ({}))
  if (!data.id) throw new Error(data.error || 'שגיאה בהעלאה לדרייב')
  return { id: data.id, name: data.name, url: data.webViewLink }
}
