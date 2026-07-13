'use client'

import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

export interface QuickCustomer {
  id: string
  name: string
  phone: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  supabase: SupabaseClient
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onCreated: (customer: QuickCustomer) => void
}

// Minimal "add customer without leaving the page" modal — only `name` is
// required (matches components/customers/CustomersClient.tsx's saveCustomer).
// Full contact details can still be filled in later from /customers.
export default function QuickAddCustomerModal({ open, onClose, tenantId, supabase, showToast, onCreated }: Props) {
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setPhone(''); setCategory('') }

  const save = async () => {
    if (!name.trim()) { showToast('נא להזין שם לקוח', 'error'); return }
    setSaving(true)
    const row = {
      id: crypto.randomUUID(), tenant_id: tenantId,
      name: name.trim(), phone: phone.trim() || null,
      category: category.trim() || null,
    }
    const { error } = await supabase.from('customers').insert(row)
    setSaving(false)
    if (error) { showToast('שגיאה בהוספת לקוח', 'error'); return }
    showToast('לקוח נוסף ✓', 'success')
    onCreated({ id: row.id, name: row.name, phone: row.phone })
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="+ לקוח חדש (מהיר)"
      maxWidth={380}
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose() }}>ביטול</Button>
          <Button onClick={save} loading={saving}>💾 שמור</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input label="שם לקוח *" value={name} onChange={e => setName(e.target.value)} placeholder="שם הלקוח" autoFocus />
        <Input label="טלפון (אופציונלי)" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" />
        <Input label="קטגוריה (אופציונלי)" value={category} onChange={e => setCategory(e.target.value)} placeholder="למשל: הקפה" />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          פרטי קשר מלאים אפשר להשלים אחר כך בעמוד &quot;לקוחות&quot;.
        </div>
      </div>
    </Modal>
  )
}
