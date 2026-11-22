'use client'

// Settings → חתימות וחותמות: scanned signatures/stamps for the signed inspection PDF.
// Upload = background removed in the browser (transparent PNG), stored in signature_stamps.
import { useCallback, useEffect, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { cleanStampImage, loadSignatureStamps, STAMP_KIND_LABEL, type SignatureStamp, type StampKind } from '@/lib/signatures/stamps'

type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void

export default function SignatureStampsPanel({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const { confirm } = useConfirm()
  const [list, setList] = useState<SignatureStamp[] | null>(null)
  const [busy, setBusy] = useState<StampKind | null>(null)

  const load = useCallback(async () => setList(await loadSignatureStamps(supabase, tenantId)), [supabase, tenantId])
  useEffect(() => { load() }, [load])

  async function upload(kind: StampKind, files: FileList) {
    setBusy(kind)
    try {
      const existing = list?.filter(r => r.kind === kind).length ?? 0
      let n = 0
      for (const f of Array.from(files)) {
        const image = await cleanStampImage(f)
        const { error } = await supabase.from('signature_stamps').insert({
          tenant_id: tenantId, kind, image,
          name: `${STAMP_KIND_LABEL[kind]} ${existing + n + 1}`,
          is_default: existing + n === 0,
        })
        if (error) throw error
        n++
      }
      showToast(n > 1 ? `${n} קבצים נוספו` : 'נוסף', 'success')
    } catch (e) {
      console.error('stamp upload', e)
      showToast('שגיאה בהעלאה', 'error')
    } finally {
      setBusy(null)
      load()
    }
  }

  async function rename(r: SignatureStamp, name: string) {
    if (name === r.name) return
    const { error } = await supabase.from('signature_stamps').update({ name }).eq('id', r.id)
    if (error) showToast('שגיאה בשמירה', 'error')
    else setList(l => l?.map(x => x.id === r.id ? { ...x, name } : x) ?? null)
  }

  async function makeDefault(r: SignatureStamp) {
    await supabase.from('signature_stamps').update({ is_default: false }).eq('tenant_id', tenantId).eq('kind', r.kind)
    const { error } = await supabase.from('signature_stamps').update({ is_default: true }).eq('id', r.id)
    if (error) showToast('שגיאה בשמירה', 'error')
    load()
  }

  async function remove(r: SignatureStamp) {
    if (!(await confirm({ msg: `למחוק את "${r.name}"?`, confirmLabel: 'מחק', icon: '🗑' }))) return
    const { error } = await supabase.from('signature_stamps').delete().eq('id', r.id)
    if (error) showToast('שגיאה במחיקה', 'error')
    load()
  }

  const section = (kind: StampKind, title: string) => {
    const rows = list?.filter(r => r.kind === kind) ?? []
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 15 }}>{title}</b>
          <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? 'default' : 'pointer', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>
            {busy === kind ? 'מעבד...' : '+ העלאה'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={busy !== null}
              onChange={e => { if (e.target.files?.length) upload(kind, e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {rows.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>אין עדיין.</div>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {rows.map(r => (
                <div key={r.id} style={{ width: 200, border: `2px solid ${r.is_default ? 'var(--primary, #2563eb)' : 'var(--border)'}`, borderRadius: 10, padding: 8, background: 'var(--bg-card)' }}>
                  <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6,
                    background: 'repeating-conic-gradient(#f1f5f9 0 25%, #fff 0 50%) 0 0/16px 16px' }}>
                    <img src={r.image} alt={r.name} style={{ maxHeight: 100, maxWidth: '95%' }} />
                  </div>
                  <input className="form-input" defaultValue={r.name} aria-label="שם" style={{ marginTop: 6, fontSize: 13 }}
                    onBlur={e => rename(r, e.target.value.trim())} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {r.is_default
                      ? <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--primary, #2563eb)', alignSelf: 'center' }}>✓ ברירת מחדל</span>
                      : <Button size="sm" variant="secondary" onClick={() => makeDefault(r)} style={{ flex: 1 }}>קבע כברירת מחדל</Button>}
                    <Button size="sm" variant="danger" onClick={() => remove(r)}>🗑</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    )
  }

  if (!list) return <div style={{ color: 'var(--text-muted)' }}>טוען...</div>
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        מעלים סריקה או צילום על דף לבן. הרקע מוסר אוטומטית. ברירת המחדל נבחרת אוטומטית בכפתור &quot;PDF חתום&quot; בבדיקות קנייה.
      </p>
      {section('signature', 'חתימות')}
      {section('stamp', 'חותמות')}
    </div>
  )
}
