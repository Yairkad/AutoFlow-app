'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import { fmtAmount, fmtDate, todayIso } from '@/lib/cars/saleContract'
import {
  KIND_LABEL, RECEIPT_LABEL, daysFromToday, isSettled, loadExpectedPayments, setReceipt,
  type ExpectedPayment, type Receipt, type ReceiptStatus,
} from '@/lib/cars/contractPayments'

// Reminders page: money buyers still owe on signed car sale contracts (cash / transfer lines + checks).
// Each one is confirmed by hand — "at signing" lines too; a check only once it cleared, or swapped for cash.

const SOON_DAYS = 30

function dueLabel(p: ExpectedPayment) {
  if (p.receipt?.status === 'bounced') return `↩ חזר ${fmtDate(p.receipt.at)}`
  const days = daysFromToday(p.due)
  if (p.atSigning) return `במעמד החתימה · ${fmtDate(p.due)}`
  if (days < 0)   return `⚠ ${-days} ימים באיחור · ${fmtDate(p.due)}`
  if (days === 0) return '⚠ היום'
  if (days === 1) return 'מחר'
  return `${fmtDate(p.due)} · עוד ${days} ימים`
}

export default function ContractPaymentsPanel() {
  const { profile } = useProfile()
  const { showToast } = useToast()
  const sb = useRef(createClient()).current
  const [items, setItems]     = useState<ExpectedPayment[]>([])
  const [missing, setMissing] = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [mark, setMark]       = useState<ExpectedPayment | null>(null)
  const [form, setForm]       = useState<{ status: ReceiptStatus; how: 'cash' | 'transfer'; at: string; note: string }>({ status: 'received', how: 'cash', at: todayIso(), note: '' })
  const [saving, setSaving]   = useState(false)

  const tenantId = profile?.tenantId
  const load = useCallback(async () => {
    if (!tenantId) return
    const r = await loadExpectedPayments(sb, tenantId)
    setItems(r.items); setMissing(r.missing); setLoaded(true)
  }, [sb, tenantId])

  useEffect(() => { load() }, [load])
  useLiveRefresh(load, 60_000)

  const groups = useMemo(() => {
    const open = items.filter(p => !isSettled(p))
    return {
      late:  open.filter(p => p.receipt?.status === 'bounced' || daysFromToday(p.due) <= 0),
      soon:  open.filter(p => p.receipt?.status !== 'bounced' && daysFromToday(p.due) > 0 && daysFromToday(p.due) <= SOON_DAYS),
      later: open.filter(p => p.receipt?.status !== 'bounced' && daysFromToday(p.due) > SOON_DAYS),
      done:  items.filter(isSettled).sort((a, b) => (b.receipt!.at).localeCompare(a.receipt!.at)),
    }
  }, [items])

  function openMark(p: ExpectedPayment) {
    setForm({ status: p.kind === 'check' ? 'cleared' : 'received', how: 'cash', at: todayIso(), note: '' })
    setMark(p)
  }

  async function save(p: ExpectedPayment, receipt: Receipt | null) {
    setSaving(true)
    const err = await setReceipt(sb, p.contractId, p.key, receipt)
    setSaving(false)
    if (err) { showToast(`שגיאה בשמירה: ${err}`, 'error'); return }
    setMark(null)
    showToast(receipt ? 'סומן ✓' : 'הסימון בוטל', 'success')
    load()
  }

  if (!loaded || (!missing && items.length === 0)) return null
  if (missing) return (
    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 20 }}>
      כדי לעקוב אחרי תשלומים מחוזי רכב יש להריץ את מיגרציה 103 (car_contract_receipts) ב-Supabase.
    </div>
  )

  const total = (list: ExpectedPayment[]) => fmtAmount(list.reduce((s, p) => s + p.amount, 0))

  const row = (p: ExpectedPayment, tone: 'late' | 'soon' | 'later' | 'done') => (
    <div key={p.contractId + p.key} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)',
      background: tone === 'late' ? '#fef2f2' : undefined,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {p.buyer}{p.car && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {p.car}</span>}
        </div>
        <div style={{ fontSize: 12.5, color: tone === 'late' ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
          {KIND_LABEL[p.kind]}{p.checkNum && ` מס' ${p.checkNum}`} · {tone === 'done'
            ? <>{RECEIPT_LABEL[p.receipt!.status]}{p.receipt!.how && ` ב${KIND_LABEL[p.receipt!.how]}`} {fmtDate(p.receipt!.at)}{p.receipt!.by && ` · ${p.receipt!.by}`}</>
            : dueLabel(p)}
          {p.receipt?.note && ` · ${p.receipt.note}`}
          {tone === 'late' && p.phone && <> · <a href={`tel:${p.phone}`} style={{ color: 'inherit', whiteSpace: 'nowrap' }}>{p.phone}</a></>}
        </div>
      </div>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>₪{fmtAmount(p.amount)}</span>
      {tone === 'done'
        ? <button onClick={() => save(p, null)} disabled={saving} title="בטל סימון"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>↶ בטל</button>
        : <Button onClick={() => openMark(p)} style={{ padding: '6px 12px', fontSize: 13 }}>סמן</Button>}
    </div>
  )

  const section = (title: string, color: string, list: ExpectedPayment[], tone: 'late' | 'soon' | 'later' | 'done', collapsed = false) => {
    if (!list.length) return null
    const head = <><span>{title} ({list.length})</span><span style={{ marginRight: 'auto', fontWeight: 800 }}>₪{total(list)}</span></>
    const headStyle: React.CSSProperties = { display: 'flex', gap: 8, padding: '10px 12px', fontWeight: 700, fontSize: 14, color, background: `color-mix(in srgb, ${color} 7%, transparent)`, cursor: collapsed ? 'pointer' : undefined }
    return collapsed
      ? <details style={{ border: `1px solid color-mix(in srgb, ${color} 33%, transparent)`, borderRadius: 10, overflow: 'hidden' }}>
          <summary style={headStyle}>{head}</summary>{list.map(p => row(p, tone))}
        </details>
      : <div style={{ border: `1px solid color-mix(in srgb, ${color} 33%, transparent)`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={headStyle}>{head}</div>{list.map(p => row(p, tone))}
        </div>
  }

  const options: { status: ReceiptStatus; how?: 'cash' | 'transfer'; label: string }[] = mark?.kind === 'check'
    ? [
        { status: 'cleared', label: '✓ נפרע בבנק' },
        { status: 'swapped', how: 'cash', label: '🔁 הוחלף במזומן' },
        { status: 'swapped', how: 'transfer', label: '🔁 הוחלף בהעברה' },
        { status: 'bounced', label: '↩ חזר' },
      ]
    : [{ status: 'received', label: '✓ התקבל' }]

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>💰 תשלומים צפויים מחוזי רכב</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        מחוזים שסומנו כנחתמו. כל תשלום מסמנים כשהכסף באמת נכנס — שיק כשנפרע או כשהוחלף במזומן.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {section('⚠ באיחור / להיום', '#dc2626', groups.late, 'late')}
        {section(`📅 ב-${SOON_DAYS} הימים הקרובים`, '#d97706', groups.soon, 'soon')}
        {section('🗓 בהמשך', '#2563eb', groups.later, 'later', true)}
        {section('✓ התקבלו', 'var(--success)', groups.done, 'done', true)}
        {!groups.late.length && !groups.soon.length && !groups.later.length && (
          <div style={{ fontSize: 13, color: 'var(--success)' }}>✓ אין תשלומים פתוחים</div>
        )}
      </div>

      <Modal open={!!mark} onClose={() => setMark(null)} maxWidth={440}
        title={mark ? `${KIND_LABEL[mark.kind]}${mark.checkNum ? ` מס' ${mark.checkNum}` : ''} · ₪${fmtAmount(mark.amount)}` : ''}
        footer={<>
          <Button variant="secondary" onClick={() => setMark(null)}>ביטול</Button>
          <Button loading={saving} onClick={() => mark && save(mark, {
            status: form.status, at: form.at || todayIso(), note: form.note.trim() || undefined,
            how: form.status === 'swapped' ? form.how : undefined, by: profile?.fullName ?? null,
          })}>💾 שמור</Button>
        </>}>
        {mark && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{mark.buyer}{mark.car && ` · ${mark.car}`} · {dueLabel(mark)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: options.length > 1 ? '1fr 1fr' : '1fr', gap: 8 }}>
              {options.map(o => {
                const on = form.status === o.status && (!o.how || form.how === o.how)
                return (
                  <button key={o.label} type="button" onClick={() => setForm(f => ({ ...f, status: o.status, how: o.how ?? f.how }))}
                    style={{ padding: '10px 8px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      border: `2px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : '#fff', color: on ? '#fff' : 'var(--text)' }}>
                    {o.label}
                  </button>
                )
              })}
            </div>
            {form.status === 'swapped' && (
              <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>
                לא להפקיד את השיק — להחזיר אותו לקונה.
              </div>
            )}
            <div>
              <label className="form-label">{form.status === 'bounced' ? 'תאריך החזרה' : 'תאריך קבלה'}</label>
              <input type="date" className="form-input" value={form.at} onChange={e => setForm(f => ({ ...f, at: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">הערה (לא חובה)</label>
              <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
