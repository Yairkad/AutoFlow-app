'use client'

import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

export interface QuickSupplier {
  id: string
  name: string
  phone: string | null
  contact_name: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  supabase: SupabaseClient
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onCreated: (supplier: QuickSupplier) => void
}

// Minimal "add supplier without leaving the page" modal — only `name` is
// required (matches components/suppliers/SuppliersClient.tsx's saveSupplier).
// Full contact/bank details can still be filled in later from /suppliers.
export default function QuickAddSupplierModal({ open, onClose, tenantId, supabase, showToast, onCreated }: Props) {
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setPhone(''); setCategory('') }

  const save = async () => {
    if (!name.trim()) { showToast('נא להזין שם ספק', 'error'); return }
    setSaving(true)
    const row = {
      id: crypto.randomUUID(), tenant_id: tenantId,
      name: name.trim(), phone: phone.trim() || null,
      category: category.trim() || null,
    }
    const { error } = await supabase.from('suppliers').insert(row)
    setSaving(false)
    if (error) { showToast('שגיאה בהוספת ספק', 'error'); return }
    showToast('ספק נוסף ✓', 'success')
    onCreated({ id: row.id, name: row.name, phone: row.phone, contact_name: null })
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="+ ספק חדש (מהיר)"
      maxWidth={380}
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose() }}>ביטול</Button>
          <Button onClick={save} loading={saving}>💾 שמור</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input label="שם ספק *" value={name} onChange={e => setName(e.target.value)} placeholder="שם החברה / הספק" autoFocus />
        <Input label="טלפון (אופציונלי)" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" />
        <Input label="קטגוריה (אופציונלי)" value={category} onChange={e => setCategory(e.target.value)} placeholder="למשל: צמיגים" />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          פרטי קשר/בנק מלאים אפשר להשלים אחר כך בעמוד &quot;ספקים&quot;.
        </div>
      </div>
    </Modal>
  )
}
