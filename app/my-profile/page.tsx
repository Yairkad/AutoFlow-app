'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'

interface MyEmployee {
  id: string
  full_name: string
  phone: string | null
  id_number: string | null
  birth_date: string | null
  address: string | null
  shirt_size: string | null
  pants_size: string | null
  shoe_size: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account: string | null
  bank_holder: string | null
}

const labelSt: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px',
}
const inputSt: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', background: 'var(--bg)', width: '100%', boxSizing: 'border-box', direction: 'rtl',
}
const sectionTitleSt: React.CSSProperties = {
  fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid var(--border)',
}

export default function MyProfilePage() {
  const sb = useRef(createClient()).current
  const { showToast } = useToast()
  const [emp, setEmp] = useState<MyEmployee | null>(null)
  const [form, setForm] = useState<Partial<MyEmployee>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await sb
        .from('employees')
        .select('id, full_name, phone, id_number, birth_date, address, shirt_size, pants_size, shoe_size, bank_name, bank_branch, bank_account, bank_holder')
        .eq('is_active', true)
        .ilike('email', user.email ?? '')
        .maybeSingle()

      if (data) {
        setEmp(data)
        setForm(data)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })()
  }, [sb])

  function setF(field: keyof MyEmployee, val: string) {
    setForm(f => ({ ...f, [field]: val || null }))
  }

  async function save() {
    if (!emp) return
    setSaving(true)
    const { error } = await sb.from('employees').update({
      id_number:    form.id_number    ?? null,
      birth_date:   form.birth_date   ?? null,
      address:      form.address      ?? null,
      shirt_size:   form.shirt_size   ?? null,
      pants_size:   form.pants_size   ?? null,
      shoe_size:    form.shoe_size    ?? null,
      bank_name:    form.bank_name    ?? null,
      bank_branch:  form.bank_branch  ?? null,
      bank_account: form.bank_account ?? null,
      bank_holder:  form.bank_holder  ?? null,
    }).eq('id', emp.id)

    setSaving(false)
    if (error) showToast('שגיאה בשמירה', 'error')
    else showToast('נשמר בהצלחה', 'success')
  }

  if (loading) return (
    <AppShell>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>טוען...</div>
    </AppShell>
  )

  if (notFound) return (
    <AppShell>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
        <div style={{ fontWeight: 600 }}>לא נמצא רשומת עובד עבור חשבון זה</div>
        <div style={{ fontSize: '13px', marginTop: '8px' }}>פנה למנהל להסדרת הפרטים</div>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={{ maxWidth: '560px', direction: 'rtl' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>👤 הפרופיל שלי</h1>
        {emp && <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>{emp.full_name}</div>}

        {/* Personal */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <div style={sectionTitleSt}>פרטים אישיים</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelSt}>מספר ת.ז.</label>
              <input style={inputSt} value={form.id_number ?? ''} onChange={e => setF('id_number', e.target.value)} placeholder="123456789" />
            </div>
            <div>
              <label style={labelSt}>תאריך לידה</label>
              <input type="date" style={inputSt} value={form.birth_date ?? ''} onChange={e => setF('birth_date', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>כתובת מגורים</label>
              <input style={inputSt} value={form.address ?? ''} onChange={e => setF('address', e.target.value)} placeholder="רחוב, עיר" />
            </div>
          </div>
        </div>

        {/* Clothing sizes */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <div style={sectionTitleSt}>מידות ביגוד</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelSt}>חולצה</label>
              <input style={inputSt} value={form.shirt_size ?? ''} onChange={e => setF('shirt_size', e.target.value)} placeholder="M / L / XL" />
            </div>
            <div>
              <label style={labelSt}>מכנסיים</label>
              <input style={inputSt} value={form.pants_size ?? ''} onChange={e => setF('pants_size', e.target.value)} placeholder="32 / 34..." />
            </div>
            <div>
              <label style={labelSt}>נעליים</label>
              <input style={inputSt} value={form.shoe_size ?? ''} onChange={e => setF('shoe_size', e.target.value)} placeholder="42 / 43..." />
            </div>
          </div>
        </div>

        {/* Bank */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <div style={sectionTitleSt}>חשבון בנק לתשלום שכר</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelSt}>שם בנק</label>
              <input style={inputSt} value={form.bank_name ?? ''} onChange={e => setF('bank_name', e.target.value)} placeholder="הפועלים / לאומי..." />
            </div>
            <div>
              <label style={labelSt}>מספר סניף</label>
              <input style={inputSt} value={form.bank_branch ?? ''} onChange={e => setF('bank_branch', e.target.value)} placeholder="123" />
            </div>
            <div>
              <label style={labelSt}>מספר חשבון</label>
              <input style={inputSt} value={form.bank_account ?? ''} onChange={e => setF('bank_account', e.target.value)} placeholder="12345678" />
            </div>
            <div>
              <label style={labelSt}>שם בעל החשבון</label>
              <input style={inputSt} value={form.bank_holder ?? ''} onChange={e => setF('bank_holder', e.target.value)} placeholder="שם מלא" />
            </div>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '11px 32px', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'שומר...' : '💾 שמור שינויים'}
        </button>
      </div>
    </AppShell>
  )
}
