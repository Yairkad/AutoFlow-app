'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { intakeMissing, newIntakeToken, type IntakeFile, type IntakeStatus } from '@/lib/inspections/intake'
import IntakeFilesModal from './IntakeFilesModal'
import IntakeQrModal from './IntakeQrModal'

// "טפסים מלקוחות" tab: send a personal pre-fill link, then see what each customer submitted
// (with a missing-data marker) until they physically arrive.

export interface IntakeRow {
  id: string
  plate: string
  make: string | null
  model: string | null
  year: number | null
  km: string | null
  owner_name: string
  owner_id: string | null
  owner_phone: string | null
  owner_address: string | null
  intake_status: IntakeStatus | null
  intake_token: string | null
  intake_files: IntakeFile[] | null
  intake_submitted_at: string | null
  intake_source: 'link' | 'qr' | null
  created_at: string
}

export const intakeLink = (token: string) => `${window.location.origin}/intake/${token}`

export function sendIntakeWhatsApp(token: string, phone: string, businessName: string) {
  const msg = `שלום, כאן ${businessName}.\nלקראת בדיקת הקנייה, נא למלא את הפרטים ולהעלות את המסמכים בקישור:\n${intakeLink(token)}`
  const digits = phone.replace(/\D/g, '')
  const to = digits ? `972${digits.replace(/^0/, '')}` : ''
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(msg)}`, '_blank')
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function IntakeTab({ rows, tenantId, businessName, onChanged, onArrived, onDelete }: {
  rows: IntakeRow[]
  tenantId: string | null
  businessName: string
  onChanged: () => void
  onArrived: (id: string) => void
  onDelete: (id: string) => void
}) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()
  const [newOpen, setNewOpen]   = useState(false)
  const [phone, setPhone]       = useState('')
  const [creating, setCreating] = useState(false)
  const [filesFor, setFilesFor] = useState<IntakeRow | null>(null)
  const [qrOpen, setQrOpen]     = useState(false)

  async function createLink(send: 'whatsapp' | 'copy') {
    if (!tenantId) return
    setCreating(true)
    const token = newIntakeToken()
    const row = {
      tenant_id: tenantId, plate: '', owner_name: '', owner_phone: phone.trim() || null,
      status: 'draft', intake_status: 'link_sent', intake_token: token,
    }
    let { error } = await supabase.from('car_inspections').insert({ ...row, intake_source: 'link' })
    // Before migration 085 there's no intake_source column — still send the link without it.
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ error } = await supabase.from('car_inspections').insert(row))
    }
    setCreating(false)
    if (error) { console.error('create intake link failed:', error); showToast('שגיאה ביצירת הלינק', 'error'); return }
    if (send === 'whatsapp') sendIntakeWhatsApp(token, phone, businessName)
    else await copyLink(token)
    setNewOpen(false); setPhone('')
    onChanged()
  }

  async function copyLink(token: string) {
    try { await navigator.clipboard.writeText(intakeLink(token)); showToast('הלינק הועתק ✓', 'success') }
    catch { window.prompt('העתק את הלינק:', intakeLink(token)) }
  }

  const sorted = [...rows].sort((a, b) =>
    (b.intake_submitted_at ?? b.created_at).localeCompare(a.intake_submitted_at ?? a.created_at))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          לקוח ממלא פרטים ומעלה מסמכים – דרך לינק אישי או הברקוד הקבוע – והבדיקה מחכה כאן עד שיגיע.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setQrOpen(true)}>📱 ברקוד / קישור קבוע</Button>
          <Button size="sm" onClick={() => setNewOpen(o => !o)}>➕ שלח לינק ללקוח</Button>
        </div>
      </div>

      {newOpen && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="form-label">טלפון הלקוח (לשליחה בוואטסאפ)</label>
            <input className="form-input" type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="050-0000000" autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && !creating) createLink('whatsapp') }} />
          </div>
          <Button onClick={() => createLink('whatsapp')} disabled={creating}>💬 שלח בוואטסאפ</Button>
          <Button variant="secondary" onClick={() => createLink('copy')} disabled={creating}>🔗 צור והעתק לינק</Button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📨</div>
          <div style={{ fontWeight: 700 }}>אין טפסים ממתינים</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(r => {
            const submitted = r.intake_status === 'submitted'
            const missing   = submitted ? intakeMissing(r) : []
            const fileCount = r.intake_files?.length ?? 0
            return (
              <div key={r.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderInlineStart: `4px solid ${!submitted ? '#94a3b8' : missing.length ? '#f59e0b' : '#10b981'}`,
                borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                      background: submitted ? '#d1fae5' : '#f1f5f9', color: submitted ? '#065f46' : '#475569',
                    }}>
                      {submitted ? `✓ מולא ${r.intake_submitted_at ? fmtDateTime(r.intake_submitted_at) : ''}` : `⏳ ממתין למילוי · נשלח ${fmtDateTime(r.created_at)}`}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {r.intake_source === 'qr' ? '📱 מהברקוד' : '🔗 לינק אישי'}
                    </span>
                    {r.plate && (
                      <span style={{ background: 'var(--primary-light,#e8f7f0)', color: 'var(--primary)', fontWeight: 800, fontFamily: 'monospace', padding: '2px 10px', borderRadius: 6, fontSize: 14 }}>
                        🚗 {r.plate}
                      </span>
                    )}
                  </div>
                  <RowActionsMenu actions={[
                    ...(r.intake_token ? [
                      { key: 'copy', label: 'העתק לינק', icon: '🔗', onClick: () => copyLink(r.intake_token!) },
                      { key: 'wa', label: 'שלח שוב בוואטסאפ', icon: '💬', onClick: () => sendIntakeWhatsApp(r.intake_token!, r.owner_phone ?? '', businessName) },
                    ] : []),
                    { key: 'delete', label: 'מחק', icon: '🗑', danger: true, onClick: () => onDelete(r.id) },
                  ]} />
                </div>

                {(r.owner_name || r.owner_phone) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{r.owner_name}</span>
                    {r.owner_phone && <span style={{ fontSize: 13, color: 'var(--text-muted)', direction: 'ltr' }}>{r.owner_phone}</span>}
                  </div>
                )}

                {submitted && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(r.make || r.model) && <span>{[r.make, r.model, r.year].filter(Boolean).join(' ')}</span>}
                    {r.km && <span>{Number(r.km).toLocaleString()} ק&quot;מ</span>}
                    {r.owner_id && <span>ת.ז: {r.owner_id}</span>}
                    {r.owner_address && <span>{r.owner_address}</span>}
                  </div>
                )}

                {missing.length > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 10px' }}>
                    ⚠️ חסר — להשלים בהגעה: {missing.join(' · ')}
                  </div>
                )}

                {submitted && (
                  <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8, flexWrap: 'wrap' }}>
                    <Button size="sm" onClick={() => onArrived(r.id)}>✅ הלקוח הגיע — פתח בדיקה</Button>
                    {fileCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => setFilesFor(r)}>📎 מסמכים ({fileCount})</Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {qrOpen && <IntakeQrModal businessName={businessName} onClose={() => setQrOpen(false)} />}

      {filesFor && (
        <IntakeFilesModal inspectionId={filesFor.id} title={filesFor.owner_name || filesFor.plate} onClose={() => setFilesFor(null)} />
      )}
    </div>
  )
}
