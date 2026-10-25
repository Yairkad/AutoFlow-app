'use client'

// History of car sale contracts — Documents → חוזי מכירה (all), and a compact list inside a car's view (carId).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import CarContractEditor, { type ContractPrefill } from './CarContractEditor'
import { type ContractRow, fmtDate, todayIso, signedFileUrl } from '@/lib/cars/saleContract'

interface Props {
  // limit to one car (compact mode inside the car view) + prefill for a new contract
  carId?: string
  prefill?: ContractPrefill
  // host renders the editor itself (the car view closes its modal first, so Escape doesn't hit both)
  onOpen?: (contractId: string | null) => void
}

export default function CarContractsPanel({ carId, prefill, onOpen }: Props) {
  const sb = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const [rows, setRows]       = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [search, setSearch]   = useState('')
  const [editor, setEditorState] = useState<{ id: string | null } | null>(null)
  const setEditor = (e: { id: string | null } | null) => { if (e && onOpen) onOpen(e.id); else setEditorState(e) }
  const compact = !!carId

  const tenantId = profile?.tenantId

  const fetchRows = useCallback(() => {
    let q = sb.from('car_sale_contracts')
      .select('id, car_id, plate, car_desc, seller_name, buyer_name, contract_date, total_price, status, created_by_name, created_at, updated_at, signed_file:data->signedFile')
      .eq('tenant_id', tenantId ?? '')
      .order('updated_at', { ascending: false })
      .limit(500)
    if (carId) q = q.eq('car_id', carId)
    return q.then(({ data, error }) => {
      // table not created yet (migration 094 not run)
      setMissing(!!error && /car_sale_contracts/.test(error.message))
      setRows((data as ContractRow[] | null) ?? [])
      setLoading(false)
    })
  }, [sb, tenantId, carId])

  const load = () => { fetchRows() }

  useEffect(() => { if (tenantId) fetchRows() }, [tenantId, fetchRows])

  async function duplicate(r: ContractRow) {
    if (!profile) return
    const { data: full } = await sb.from('car_sale_contracts').select('*').eq('id', r.id).single()
    if (!full) { showToast('שגיאה בשכפול', 'error'); return }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = full
    const { data: ins, error } = await sb.from('car_sale_contracts').insert({
      ...rest, status: 'draft', contract_date: todayIso(),
      data: { ...full.data, date: todayIso(), signedFile: null }, receipts: {},
      created_by: profile.userId, created_by_name: profile.fullName,
    }).select('id').single()
    if (error || !ins) { showToast('שגיאה בשכפול', 'error'); return }
    await fetchRows()
    setEditor({ id: ins.id })
  }

  async function remove(r: ContractRow) {
    const ok = await confirm({ msg: `למחוק את החוזה${r.buyer_name ? ' עם ' + r.buyer_name : ''}${r.plate ? ' (' + r.plate + ')' : ''}?`, variant: 'danger' })
    if (!ok) return
    const { error } = await sb.from('car_sale_contracts').delete().eq('id', r.id)
    if (error) { showToast('שגיאה במחיקה', 'error'); return }
    setRows(prev => prev.filter(x => x.id !== r.id))
    showToast('החוזה נמחק', 'success')
  }

  const s = search.trim().toLowerCase()
  const shown = s
    ? rows.filter(r => [r.plate, r.car_desc, r.seller_name, r.buyer_name].some(v => v?.toLowerCase().includes(s)))
    : rows

  const editorEl = !onOpen && (
    <CarContractEditor
      open={!!editor} contractId={editor?.id ?? null} carId={carId ?? null} prefill={prefill}
      onClose={() => setEditor(null)} onSaved={load}
    />
  )

  if (missing) return (
    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: 12, fontSize: 13 }}>
      יש להריץ את מיגרציה 094 (car_sale_contracts) ב-Supabase כדי להפעיל שמירת חוזים.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!compact && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מס' רכב, קונה, מוכר..."
            style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: 'inherit', fontSize: 13 }} />
        )}
        <Button size="sm" onClick={() => setEditor({ id: null })}>+ חוזה חדש</Button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>טוען...</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: compact ? 0 : '24px 0', textAlign: compact ? undefined : 'center' }}>
          {rows.length ? 'לא נמצאו חוזים' : 'עדיין אין חוזים שמורים'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map(r => (
            <div key={r.id} onClick={() => setEditor({ id: r.id })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 20 }}>📝</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.plate && <span style={{ direction: 'ltr', background: '#fef9c3', border: '1px solid #eab308', borderRadius: 5, padding: '0 6px', fontSize: 12.5 }}>{r.plate}</span>}
                  <span>{r.car_desc || 'רכב'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 8, background: r.status === 'signed' ? '#dcfce7' : '#f1f5f9', color: r.status === 'signed' ? '#166534' : '#64748b' }}>
                    {r.status === 'signed' ? 'נחתם' : 'טיוטה'}
                  </span>
                  {r.signed_file && (
                    <a href={signedFileUrl(r.signed_file)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>📎 חוזה חתום</a>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {[r.seller_name && `מוכר: ${r.seller_name}`, r.buyer_name && `קונה: ${r.buyer_name}`, r.total_price && `₪${r.total_price}`, r.contract_date && fmtDate(r.contract_date)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <RowActionsMenu align="end" actions={[
                  { key: 'open', label: 'פתח / ערוך', icon: '✏️', onClick: () => setEditor({ id: r.id }) },
                  { key: 'dup',  label: 'שכפל לחוזה חדש', icon: '📄', onClick: () => duplicate(r) },
                  { key: 'del',  label: 'מחק', icon: '🗑', danger: true, onClick: () => remove(r) },
                ]} />
              </div>
            </div>
          ))}
        </div>
      )}
      {editorEl}
    </div>
  )
}
