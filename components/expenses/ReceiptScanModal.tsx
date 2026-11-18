'use client'

// "סריקת קבלה" — scan / pick a receipt and save it straight to Drive (קבלות/<year>/<month>)
// without linking it to an expense. Date / description / amount only name the file.
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import ReceiptPicker from '@/components/expenses/ReceiptPicker'
import ScanPreview, { LinkBtn } from '@/components/ui/ScanPreview'
import { receiptFileName, uploadReceipt } from '@/lib/expenses/receipts'

export default function ReceiptScanModal({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId: string }) {
  const { showToast } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [supplier, setSupplier] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const meta = { date, description: [supplier.trim(), desc.trim()].filter(Boolean).join(' – '), amount: amount ? parseFloat(amount) : null }
  const close = () => { setFile(null); setDesc(''); setSupplier(''); setAmount(''); setDate(today); onClose() }

  async function save() {
    if (!file) return
    setBusy(true)
    try {
      await uploadReceipt(file, meta, tenantId)
      showToast(`נשמר בדרייב: קבלות › ${date.slice(0, 4)} › ${date.slice(5, 7)}`, 'success')
      close()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'שגיאה בהעלאה', 'error')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={close} title="🧾 סריקת קבלה לדרייב" maxWidth={460}
      footer={<>
        <Button variant="secondary" onClick={close}>ביטול</Button>
        <Button onClick={save} loading={busy} disabled={!file}>💾 שמירה לדרייב</Button>
      </>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label className="form-label">תאריך</label>
          <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="form-label">ספק / בית עסק <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(לא חובה)</span></label>
          <input className="form-input" value={supplier} placeholder="למשל: כנעני חשמל" onChange={e => setSupplier(e.target.value)} />
        </div>
        <div>
          <label className="form-label">תיאור</label>
          <input className="form-input" value={desc} placeholder="למשל: דלק פז" onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <label className="form-label">סכום (₪) <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(לא חובה)</span></label>
          <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {file ? (
          <ScanPreview file={file}
            caption={<>
              <div>יישמר בשם: <b dir="auto">{receiptFileName(meta, file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '')}</b></div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>תיקייה: קבלות › {date.slice(0, 4)} › {date.slice(5, 7)}</div>
            </>}
            actions={<LinkBtn onClick={() => setFile(null)} danger>סריקה מחדש</LinkBtn>} />
        ) : <ReceiptPicker onFile={setFile} disabled={busy} />}
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>לא נוצרת הוצאה — רק שמירת הקובץ. כדי לקשר קבלה להוצאה, צרף אותה מתוך ההוצאה.</div>
      </div>
    </Modal>
  )
}
