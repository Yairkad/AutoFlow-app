'use client'

// "PDF חתום": the findings report with the inspector's signature + stamp, downloaded as a PDF the
// office sends to the customer itself (WhatsApp / email). The customer's signature line stays empty.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { htmlToPdf } from '@/lib/print/htmlToPdf'
import { loadSignatureStamps, type SignatureStamp, type StampKind } from '@/lib/signatures/stamps'
import { SkeletonCards } from '@/components/ui/Skeleton'

interface Props {
  tenantId: string
  plate: string
  /** builds the findings HTML with the chosen images */
  buildHtml: (signing: { signature: string | null; stamp: string | null }) => string
  onClose: () => void
}

export default function SignedPdfModal({ tenantId, plate, buildHtml, onClose }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { showToast } = useToast()
  const [list, setList] = useState<SignatureStamp[] | null>(null)
  const [sel, setSel] = useState<Record<StampKind, string>>({ stamp: '', signature: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadSignatureStamps(supabase, tenantId).then(rows => {
      setList(rows)
      const pick = (k: StampKind) => (rows.find(r => r.kind === k && r.is_default) ?? rows.find(r => r.kind === k))?.id ?? ''
      setSel({ stamp: pick('stamp'), signature: pick('signature') })
    })
  }, [supabase, tenantId])

  const imgOf = (k: StampKind) => list?.find(r => r.id === sel[k])?.image ?? null

  async function download() {
    setBusy(true)
    try {
      const html = buildHtml({ signature: imgOf('signature'), stamp: imgOf('stamp') })
      await htmlToPdf(html, {
        pageSelector: '.page',
        fileName: `ממצאי בדיקה ${plate}.pdf`,
        // print layout: sigs/page number sit inside the 10/15mm @page margin — same spot here
        extraCss: '.sigs{bottom:28mm!important;left:30mm!important;right:30mm!important}.pagenum{bottom:13mm!important}',
      })
      onClose()
    } catch (e) {
      console.error('signed pdf', e)
      showToast('שגיאה ביצירת ה‑PDF', 'error')
    } finally {
      setBusy(false)
    }
  }

  const picker = (k: StampKind, label: string) => {
    const opts = list?.filter(r => r.kind === k) ?? []
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="form-label">{label}</div>
        <select className="form-input" value={sel[k]} onChange={e => setSel(s => ({ ...s, [k]: e.target.value }))}>
          <option value="">ללא</option>
          {opts.map(o => <option key={o.id} value={o.id}>{o.name || label}</option>)}
        </select>
        <div style={{ height: 90, marginTop: 8, border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
          {imgOf(k) ? <img src={imgOf(k)!} alt="" style={{ maxHeight: 80, maxWidth: '90%' }} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
        </div>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} title={`PDF חתום — ${plate}`} guard={false}
      footer={<>
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
        <Button onClick={download} loading={busy} disabled={!list}>⬇️ הורד PDF</Button>
      </>}>
      {!list ? <SkeletonCards n={2} h={150} min={200} /> : (
        <>
          {list.length === 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
              עדיין לא הועלו חתימות או חותמות. אפשר להעלות ב<Link href="/settings?tab=signatures" style={{ fontWeight: 700 }}>הגדרות ← חתימות וחותמות</Link>.
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {picker('signature', 'חתימה')}
            {picker('stamp', 'חותמת')}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
            החתימה והחותמת יופיעו בשורת &quot;חתימת הבוחן&quot;. שורת חתימת המזמין נשארת ריקה. את הקובץ שולחים ללקוח בווטסאפ או במייל.
          </p>
        </>
      )}
    </Modal>
  )
}
