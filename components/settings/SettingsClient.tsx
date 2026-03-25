'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void

// ── Types ──────────────────────────────────────────────────────────────────

interface PublicInfo {
  hours?: string
  waze_url?: string
  maps_url?: string
  meta_title?: string
  meta_description?: string
  email?: string
}

interface Tenant {
  id: string
  name: string
  sub_title: string | null
  phone: string | null
  address: string | null
  tax_id: string | null
  license_number: string | null
  logo_base64: string | null
  public_info: PublicInfo
}

interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  role: string
  allowed_modules: string[]
  is_active: boolean
  created_at: string
  email?: string  // joined from auth.users via RPC or stored
}

interface VaultItem {
  id: string
  title: string
  category: string   // 'site' | 'bank' | 'credit' | 'other'
  username: string | null
  password: string | null
  notes: string | null
  url: string | null
  created_at: string
}

interface InviteToken {
  id: string
  token: string
  used: boolean
  created_at: string
  expires_at: string | null
}

type Tab = 'business' | 'users' | 'vault' | 'landing' | 'backup'

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  { key: 'expenses',   label: '💰 הוצאות' },
  { key: 'debts',      label: '💳 חובות' },
  { key: 'employees',  label: '👷 עובדים' },
  { key: 'products',   label: '📦 מוצרים' },
  { key: 'tires',      label: '🔘 צמיגים' },
  { key: 'cars',       label: '🚗 רכבים' },
  { key: 'quotes',     label: '💬 הצעות מחיר' },
  { key: 'suppliers',  label: '🏭 ספקים' },
  { key: 'alignment',  label: '🔩 פרונט / כיוון' },
  { key: 'inspections',label: '📝 בדיקות קניה' },
  { key: 'reminders',  label: '🔔 תזכורות' },
  { key: 'documents',  label: '📄 מסמכים' },
  { key: 'billing',    label: '🧾 חשבונות' },
  { key: 'settings',   label: '⚙️ הגדרות (כללי)' },
  { key: 'vault',          label: '🔒 כספת סיסמאות' },
  { key: 'products_view', label: '📦 מוצרים (צפיה בלבד)' },
  { key: 'tires_view',    label: '🔘 צמיגים (צפיה בלבד)' },
  { key: 'my_profile',    label: '👤 פרופיל אישי' },
]

const inputSt: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: '9px',
  fontSize: '13px', background: '#f8fafc', direction: 'rtl', width: '100%', boxSizing: 'border-box',
}
const labelSt: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }
const btnPrim: React.CSSProperties = {
  padding: '9px 20px', background: '#f0fdf9', color: '#15803d',
  border: '1.5px solid #bbf7d0', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnSec: React.CSSProperties = {
  padding: '9px 20px', background: '#fff', color: 'var(--text-muted)',
  border: '1.5px solid var(--border)', borderRadius: '9px', fontSize: '13px', cursor: 'pointer',
}

function field(label: string, el: React.ReactNode) {
  return (
    <div>
      <label style={labelSt}>{label}</label>
      {el}
    </div>
  )
}

// ── BusinessTab ────────────────────────────────────────────────────────────

function BusinessTab({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [tenant,     setTenant]     = useState<Tenant | null>(null)
  const [origTenant, setOrigTenant] = useState<Tenant | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
    if (data) {
      const t = { ...data, public_info: data.public_info ?? {} }
      setTenant(t); setOrigTenant(t); setLogoPreview(data.logo_base64)
    }
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editing) return
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) { showToast('הלוגו גדול מדי (מקסימום 500KB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setLogoPreview(b64)
      setTenant(t => t ? { ...t, logo_base64: b64 } : t)
    }
    reader.readAsDataURL(file)
  }

  function cancel() {
    setTenant(origTenant)
    setLogoPreview(origTenant?.logo_base64 ?? null)
    setEditing(false)
  }

  async function save() {
    if (!tenant) return
    setSaving(true)
    const { error } = await supabase.from('tenants').update({
      name:           tenant.name,
      sub_title:      tenant.sub_title,
      phone:          tenant.phone,
      address:        tenant.address,
      tax_id:         tenant.tax_id,
      license_number: tenant.license_number,
      logo_base64:    tenant.logo_base64,
      public_info:    tenant.public_info,
    }).eq('id', tenantId)
    setSaving(false)
    if (error) { showToast('שגיאה בשמירה', 'error') }
    else { setOrigTenant(tenant); setEditing(false); showToast('נשמר בהצלחה', 'success') }
  }

  if (!tenant) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  const infoRow = (icon: string, label: string, value: string | null | undefined) =>
    value ? (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '15px', flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '1px' }}>{label}</div>
          <div style={{ fontWeight: 500 }}>{value}</div>
        </div>
      </div>
    ) : null

  return (
    <>
      {/* ── View mode ── */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: '12px',
          border: '2px dashed var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', background: 'var(--bg)', flexShrink: 0,
        }}>
          {logoPreview
            ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: '30px' }}>🏢</span>
          }
        </div>

        {/* Info summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>{tenant.name}</div>
          {tenant.sub_title && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{tenant.sub_title}</div>}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {tenant.phone   && <span>📞 {tenant.phone}</span>}
            {tenant.address && <span>📍 {tenant.address}</span>}
            {tenant.public_info?.email && <span>✉️ {tenant.public_info.email}</span>}
          </div>
        </div>

        <button onClick={() => setEditing(true)} style={{ ...btnSec, flexShrink: 0 }}>✏️ עריכה</button>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={cancel}
        >
          <div
            style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', maxWidth: '560px', width: '100%', margin: '16px', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700 }}>✏️ עריכת פרטי עסק</h3>

            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{ width: 64, height: 64, borderRadius: '10px', border: '2px dashed var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', background: 'var(--bg)', flexShrink: 0 }}
                title="לחץ לשינוי לוגו"
              >
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '24px' }}>🏢</span>
                }
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>לוגו העסק</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>PNG / JPG עד 500KB</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => fileRef.current?.click()} style={{ ...btnSec, fontSize: '12px', padding: '5px 12px' }}>בחר תמונה</button>
                  {logoPreview && (
                    <button onClick={() => { setLogoPreview(null); setTenant(t => t ? { ...t, logo_base64: null } : t) }} style={{ ...btnSec, fontSize: '12px', padding: '5px 12px', color: 'var(--danger)', borderColor: '#fecaca' }}>הסר</button>
                  )}
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* פרטי העסק */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>🏢 פרטי העסק</div>
              <div className="settings-grid-3">
                {field('שם עסק *', <input style={inputSt} value={tenant.name} onChange={e => setTenant(t => t ? { ...t, name: e.target.value } : t)} placeholder="שם העסק" />)}
                {field('כותרת משנה', <input style={inputSt} value={tenant.sub_title ?? ''} onChange={e => setTenant(t => t ? { ...t, sub_title: e.target.value } : t)} placeholder="מוסך ופנצריה" />)}
                {field('טלפון', <input style={inputSt} value={tenant.phone ?? ''} onChange={e => setTenant(t => t ? { ...t, phone: e.target.value } : t)} placeholder="050-0000000" dir="ltr" />)}
                {field('כתובת', <input style={inputSt} value={tenant.address ?? ''} onChange={e => setTenant(t => t ? { ...t, address: e.target.value } : t)} placeholder="רחוב, עיר" />)}
                {field('ח.פ / ע.מ', <input style={inputSt} value={tenant.tax_id ?? ''} onChange={e => setTenant(t => t ? { ...t, tax_id: e.target.value } : t)} placeholder="מספר עוסק" dir="ltr" />)}
                {field('מספר רישיון', <input style={inputSt} value={tenant.license_number ?? ''} onChange={e => setTenant(t => t ? { ...t, license_number: e.target.value } : t)} placeholder="הכנס מספר בלבד" />)}
              </div>
              {field('אימייל (ליצירת קשר)', <input style={inputSt} dir="ltr" type="email" value={tenant.public_info?.email ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, email: e.target.value } } : t)} placeholder="info@example.com" />)}

              {/* דף ציבורי */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginTop: '4px' }}>🌐 דף ציבורי</div>
              {field('שעות פעילות', <input style={inputSt} value={tenant.public_info?.hours ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, hours: e.target.value } } : t)} placeholder="א׳-ה׳ 08:00–18:00 | ו׳ 08:00–13:00" />)}
              <div className="settings-grid-2">
                {field('קישור Waze', <input style={inputSt} dir="ltr" value={tenant.public_info?.waze_url ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, waze_url: e.target.value } } : t)} placeholder="https://waze.com/ul/..." />)}
                {field('קישור Google Maps', <input style={inputSt} dir="ltr" value={tenant.public_info?.maps_url ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, maps_url: e.target.value } } : t)} placeholder="https://maps.app.goo.gl/..." />)}
              </div>

              {/* SEO */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginTop: '4px' }}>🔍 SEO / כרטיסיית הדפדפן</div>
              {field('כותרת (title)', <input style={inputSt} value={tenant.public_info?.meta_title ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, meta_title: e.target.value } } : t)} placeholder={`${tenant.name} – מערכת ניהול`} />)}
              {field('תיאור (description)', (
                <textarea style={{ ...inputSt, resize: 'vertical', minHeight: '60px' }} value={tenant.public_info?.meta_description ?? ''} onChange={e => setTenant(t => t ? { ...t, public_info: { ...t.public_info, meta_description: e.target.value } } : t)} placeholder="תיאור קצר של העסק – עד 160 תווים" maxLength={160} rows={2} />
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button onClick={cancel} style={btnSec}>ביטול</button>
              <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>
                {saving ? 'שומר...' : '💾 שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── UsersTab ───────────────────────────────────────────────────────────────

const emptyCreateForm = { full_name: '', email: '', password: '', phone: '', role: 'employee', allowed_modules: ['products_view', 'tires_view', 'my_profile'] as string[] }

function UsersTab({ supabase, tenantId, myId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; myId: string; showToast: ToastFn }) {
  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [editing,     setEditing]     = useState<string | null>(null)
  const [editData,    setEditData]    = useState<Partial<Profile>>({})
  const [saving,      setSaving]      = useState(false)
  const [createOpen,  setCreateOpen]  = useState(false)
  const [createForm,  setCreateForm]  = useState(emptyCreateForm)
  const [creating,    setCreating]    = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, allowed_modules, is_active, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at')
    setProfiles(data ?? [])
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function startEdit(p: Profile) {
    setEditing(p.id)
    setEditData({ role: p.role, allowed_modules: p.allowed_modules ?? [], is_active: p.is_active, full_name: p.full_name ?? '', phone: p.phone ?? '' })
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name:       editData.full_name,
      phone:           editData.phone,
      role:            editData.role,
      allowed_modules: editData.allowed_modules,
      is_active:       editData.is_active,
    }).eq('id', editing)
    setSaving(false)
    if (error) showToast('שגיאה בשמירה', 'error')
    else { showToast('עודכן', 'success'); setEditing(null); load() }
  }

  function toggleModule(key: string) {
    setEditData(d => {
      const mods = d.allowed_modules ?? []
      return { ...d, allowed_modules: mods.includes(key) ? mods.filter(m => m !== key) : [...mods, key] }
    })
  }

  function toggleCreateModule(key: string) {
    setCreateForm(f => ({
      ...f,
      allowed_modules: f.allowed_modules.includes(key)
        ? f.allowed_modules.filter(k => k !== key)
        : [...f.allowed_modules, key],
    }))
  }

  async function handleCreate() {
    if (!createForm.email || !createForm.password) return showToast('מייל וסיסמה חובה', 'error')
    setCreating(true)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) showToast(json.error || 'שגיאה ביצירה', 'error')
    else { showToast('משתמש נוצר', 'success'); setCreateOpen(false); setCreateForm(emptyCreateForm); load() }
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`למחוק את "${name}"? פעולה זו אינה הפיכה.`)) return
    setDeleting(userId)
    const res = await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const json = await res.json()
    setDeleting(null)
    if (!res.ok) showToast(json.error || 'שגיאה במחיקה', 'error')
    else { showToast('משתמש נמחק', 'success'); load() }
  }

  const roleLabel = (r: string) =>
    r === 'super_admin' ? '🔧 מפתח' : r === 'admin' ? '👑 מנהל' : '👤 עובד'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Add user button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>👥 משתמשים</div>
        <button onClick={() => setCreateOpen(v => !v)} style={{ ...btnPrim, padding: '7px 16px', fontSize: '12px' }}>
          {createOpen ? '✕ ביטול' : '+ הוסף משתמש'}
        </button>
      </div>

      {/* Create user form */}
      {createOpen && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('שם מלא', <input style={inputSt} value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} placeholder="ישראל ישראלי" />)}
            {field('טלפון', <input style={inputSt} value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" placeholder="050-0000000" />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('אימייל *', <input style={inputSt} type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} dir="ltr" placeholder="user@example.com" />)}
            {field('סיסמה זמנית *', <input style={inputSt} type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} dir="ltr" placeholder="לפחות 6 תווים" />)}
          </div>
          {field('תפקיד', (
            <select style={inputSt} value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">👑 מנהל</option>
              <option value="employee">👤 עובד</option>
            </select>
          ))}
          {createForm.role === 'employee' && (
            <div>
              <label style={labelSt}>הרשאות</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '6px' }}>
                {ALL_MODULES.map(m => {
                  const active = createForm.allowed_modules.includes(m.key)
                  return (
                    <button key={m.key} onClick={() => toggleCreateModule(m.key)} style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                      border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: active ? '#f0fdf4' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 400,
                    }}>{m.label}</button>
                  )
                })}
              </div>
            </div>
          )}
          <button onClick={handleCreate} disabled={creating} style={{ ...btnPrim, opacity: creating ? .7 : 1, alignSelf: 'flex-start' }}>
            {creating ? 'יוצר...' : '✓ צור משתמש'}
          </button>
        </div>
      )}

      <InviteSection supabase={supabase} tenantId={tenantId} showToast={showToast} />

      {profiles.map(p => (
        <div key={p.id} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
          padding: '16px', opacity: p.is_active ? 1 : .55,
        }}>
          {editing === p.id ? (
            // ── Edit mode ──
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('שם מלא', (
                  <input style={inputSt} value={editData.full_name ?? ''} onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))} />
                ))}
                {field('טלפון', (
                  <input style={inputSt} value={editData.phone ?? ''} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} dir="ltr" />
                ))}
              </div>

              {field('תפקיד', (
                <select style={inputSt} value={editData.role} onChange={e => setEditData(d => ({ ...d, role: e.target.value }))}>
                  <option value="super_admin">🔧 מפתח</option>
                  <option value="admin">👑 מנהל</option>
                  <option value="employee">👤 עובד</option>
                </select>
              ))}

              {editData.role === 'employee' && (
                <div>
                  <label style={labelSt}>מודולים מורשים</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {ALL_MODULES.map(m => {
                      const active = (editData.allowed_modules ?? []).includes(m.key)
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggleModule(m.key)}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                            border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: active ? '#f0fdf4' : 'transparent',
                            color: active ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '9px', border: '1.5px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>משתמש פעיל</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>אפשר גישה למערכת</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" id={`active-${p.id}`} checked={editData.is_active} onChange={e => setEditData(d => ({ ...d, is_active: e.target.checked }))} />
                  <span className="toggle-track" />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveEdit} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>{saving ? 'שומר...' : '💾 שמור'}</button>
                <button onClick={() => setEditing(null)} style={btnSec}>ביטול</button>
              </div>
            </div>
          ) : (
            // ── View mode ──
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: p.id === myId ? 'var(--primary)' : '#94a3b8',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '15px', flexShrink: 0,
              }}>
                {(p.full_name ?? '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  {p.full_name ?? '(ללא שם)'}
                  {p.id === myId && <span style={{ fontSize: '11px', color: 'var(--primary)', marginRight: '6px' }}> אתה</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '12px' }}>
                  <span>{roleLabel(p.role)}</span>
                  {p.phone && <span>{p.phone}</span>}
                  {!p.is_active && <span style={{ color: 'var(--danger)' }}>מושבת</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {p.role !== 'super_admin' && (
                  <button onClick={() => startEdit(p)} style={{ ...btnSec, padding: '6px 14px', fontSize: '12px' }}>ערוך</button>
                )}
                {p.id !== myId && p.role !== 'super_admin' && (
                  <button
                    onClick={() => handleDelete(p.id, p.full_name ?? p.id)}
                    disabled={deleting === p.id}
                    style={{ padding: '6px 10px', background: 'transparent', border: '1px solid #fca5a5', borderRadius: '8px', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', opacity: deleting === p.id ? .5 : 1 }}
                  >
                    {deleting === p.id ? '...' : '🗑'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {profiles.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין משתמשים</div>
      )}
    </div>
  )
}

// ── InviteSection ──────────────────────────────────────────────────────────

const DEFAULT_INVITE_MODULES = ['products_view', 'tires_view', 'my_profile']

function InviteSection({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [tokens,      setTokens]      = useState<InviteToken[]>([])
  const [creating,    setCreating]    = useState(false)
  const [expiryDays,  setExpiryDays]  = useState('7')
  const [selMods,     setSelMods]     = useState<string[]>(DEFAULT_INVITE_MODULES)
  const [open,        setOpen]        = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('registration_tokens')
      .select('id, token, used, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)
    setTokens(data ?? [])
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function toggleMod(key: string) {
    setSelMods(m => m.includes(key) ? m.filter(k => k !== key) : [...m, key])
  }

  async function createToken() {
    setCreating(true)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)
    const days  = parseInt(expiryDays) || 7
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString()
    const { error } = await supabase.from('registration_tokens').insert({
      tenant_id: tenantId, token, type: 'employee',
      used: false, expires_at: expiresAt, default_modules: selMods,
    })
    setCreating(false)
    if (error) showToast('שגיאה ביצירת קישור', 'error')
    else { showToast('קישור נוצר', 'success'); setOpen(false); load() }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/register?token=${token}&type=employee`
    navigator.clipboard.writeText(url).then(() => showToast('קישור הועתק', 'success'))
  }

  async function revokeToken(id: string) {
    await supabase.from('registration_tokens').delete().eq('id', id)
    load()
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const isExpired  = (t: InviteToken) => t.expires_at ? new Date(t.expires_at) < new Date() : false

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>🔗 הזמנת עובד חדש</div>
        <button onClick={() => setOpen(v => !v)} style={{ ...btnPrim, padding: '7px 16px', fontSize: '12px' }}>
          {open ? '✕ ביטול' : '+ צור קישור'}
        </button>
      </div>

      {open && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          {/* Modules */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>הרשאות לעובד החדש</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '6px' }}>
              {ALL_MODULES.map(m => {
                const active = selMods.includes(m.key)
                return (
                  <button key={m.key} onClick={() => toggleMod(m.key)} style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? '#f0fdf4' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400,
                  }}>{m.label}</button>
                )
              })}
            </div>
          </div>

          {/* Expiry + create */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div>
              <label style={labelSt}>תוקף</label>
              <select style={{ ...inputSt, width: '130px' }} value={expiryDays} onChange={e => setExpiryDays(e.target.value)}>
                <option value="1">יום אחד</option>
                <option value="3">3 ימים</option>
                <option value="7">שבוע</option>
                <option value="30">חודש</option>
              </select>
            </div>
            <button onClick={createToken} disabled={creating} style={{ ...btnPrim, opacity: creating ? .7 : 1 }}>
              {creating ? 'יוצר...' : '🔗 צור קישור'}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {tokens.map(t => {
            const expired = isExpired(t)
            const status  = t.used ? 'נוצל' : expired ? 'פג תוקף' : 'פעיל'
            const statusColor = t.used ? '#94a3b8' : expired ? 'var(--danger)' : 'var(--primary)'
            return (
              <div key={t.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
                opacity: t.used || expired ? .6 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <code style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.token}</code>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    נוצר: {formatDate(t.created_at)}{t.expires_at && ` · פג: ${formatDate(t.expires_at)}`}
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor }}>{status}</span>
                {!t.used && !expired && (
                  <button onClick={() => copyLink(t.token)} style={{ ...btnSec, padding: '5px 12px', fontSize: '12px' }}>העתק</button>
                )}
                <button onClick={() => revokeToken(t.id)} style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: '6px', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ borderBottom: '1px solid var(--border)', marginTop: '20px', marginBottom: '20px' }} />
    </div>
  )
}

// ── VaultTab ────────────────────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = { site: '🌐 אתר', bank: '🏦 בנק', credit: '💳 כרטיס אשראי', other: '🔑 אחר' }
const EMPTY_ITEM = { title: '', category: 'other', username: '', password: '', notes: '', url: '' }

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function VaultTab({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [unlocked,      setUnlocked]      = useState(false)
  const [pinInput,      setPinInput]      = useState('')
  const [pinError,      setPinError]      = useState('')
  const [settingPin,    setSettingPin]    = useState(false)
  const [changingPin,   setChangingPin]   = useState(false)
  const [oldPinInput,   setOldPinInput]   = useState('')
  const [newPin,        setNewPin]        = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')
  const [pinConfirm,    setPinConfirm]    = useState('')
  const [hasPinSet,  setHasPinSet]  = useState<boolean | null>(null)
  const [items,      setItems]      = useState<VaultItem[]>([])
  const [showForm,   setShowForm]   = useState(false)
  const [editItem,   setEditItem]   = useState<VaultItem | null>(null)
  const [form,       setForm]       = useState(EMPTY_ITEM)
  const [saving,     setSaving]     = useState(false)
  const [revealed,   setRevealed]   = useState<Set<string>>(new Set())
  const [menuOpen,   setMenuOpen]   = useState<string | null>(null)

  // Check if PIN is set
  useEffect(() => {
    supabase.from('tenants').select('settings').eq('id', tenantId).single().then(({ data }) => {
      setHasPinSet(!!(data?.settings as Record<string, unknown>)?.vault_pin_hash)
    })
  }, [supabase, tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const { data } = await supabase.from('vault_items').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    setItems(data ?? [])
  }, [supabase, tenantId])

  async function verifyPin() {
    const hash = await hashPin(pinInput)
    const { data } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
    const stored = (data?.settings as Record<string, unknown>)?.vault_pin_hash
    if (stored === hash) {
      setUnlocked(true); setPinInput(''); setPinError(''); load()
    } else {
      setPinInput(''); setPinError('קוד שגוי — נסה שנית')
    }
  }

  async function savePin() {
    if (pinInput.length < 4) { setPinError('מינימום 4 ספרות'); return }
    if (pinInput !== pinConfirm) { setPinError('הקודים אינם תואמים'); return }
    const hash = await hashPin(pinInput)
    const { data: t } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
    const current = (t?.settings as Record<string, unknown>) ?? {}
    const { error } = await supabase.from('tenants').update({ settings: { ...current, vault_pin_hash: hash } }).eq('id', tenantId)
    if (error) { setPinError('שגיאה בשמירה, נסה שוב'); return }
    setHasPinSet(true); setSettingPin(false); setPinInput(''); setPinConfirm(''); setPinError('')
    showToast('קוד הוגדר', 'success')
  }

  async function changePin() {
    if (!oldPinInput)              { setPinError('יש להזין את הקוד הנוכחי'); return }
    if (newPin.length < 4)        { setPinError('קוד חדש – מינימום 4 ספרות'); return }
    if (newPin !== newPinConfirm) { setPinError('הקודים החדשים אינם תואמים'); return }
    // Verify old PIN
    const oldHash = await hashPin(oldPinInput)
    const { data: t } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
    const current = (t?.settings as Record<string, unknown>) ?? {}
    if (current.vault_pin_hash !== oldHash) { setPinError('הקוד הנוכחי שגוי'); return }
    // Save new PIN
    const newHash = await hashPin(newPin)
    const { error } = await supabase.from('tenants').update({ settings: { ...current, vault_pin_hash: newHash } }).eq('id', tenantId)
    if (error) { setPinError('שגיאה בשמירה, נסה שוב'); return }
    setChangingPin(false); setOldPinInput(''); setNewPin(''); setNewPinConfirm(''); setPinError('')
    showToast('קוד הכספת עודכן', 'success')
  }

  function openAdd() { setForm(EMPTY_ITEM); setEditItem(null); setShowForm(true) }
  function openEdit(item: VaultItem) {
    setForm({ title: item.title, category: item.category, username: item.username ?? '', password: item.password ?? '', notes: item.notes ?? '', url: item.url ?? '' })
    setEditItem(item); setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { showToast('חובה להזין כותרת', 'error'); return }
    setSaving(true)
    const payload = { tenant_id: tenantId, title: form.title.trim(), category: form.category, username: form.username || null, password: form.password || null, notes: form.notes || null, url: form.url || null }
    if (editItem) {
      await supabase.from('vault_items').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('vault_items').insert(payload)
    }
    setSaving(false); setShowForm(false); load()
    showToast(editItem ? 'עודכן' : 'נוסף', 'success')
  }

  async function deleteItem(id: string) {
    await supabase.from('vault_items').delete().eq('id', id)
    load()
    showToast('נמחק', 'success')
  }

  function toggleReveal(id: string) {
    setRevealed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} הועתק`, 'success'))
  }

  // ── Lock screen ──
  if (hasPinSet === null) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  if (!unlocked) {
    return (
      <div style={{ maxWidth: '360px', margin: '0 auto', paddingTop: '20px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px' }}>כספת סיסמאות</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
            {hasPinSet ? 'הזן קוד גישה להצגת הסיסמאות' : 'הגדר קוד גישה לכספת'}
          </div>

          {!hasPinSet || settingPin ? (
            <>
              <input
                type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true"
                value={pinInput} onChange={e => setPinInput(e.target.value)}
                placeholder="קוד גישה (מינימום 4)"
                style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '18px', marginBottom: '12px' }}
              />
              {(!hasPinSet || settingPin) && (
                <input
                  type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true"
                  value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
                  placeholder="אמת קוד גישה"
                  style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '18px', marginBottom: '12px' }}
                />
              )}
              {pinError && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{pinError}</div>}
              <button onClick={savePin} style={{ ...btnPrim, width: '100%' }}>הגדר קוד</button>
              {settingPin && <button onClick={() => { setSettingPin(false); setPinInput(''); setPinConfirm(''); setPinError('') }} style={{ ...btnSec, width: '100%', marginTop: '8px' }}>ביטול</button>}
            </>
          ) : (
            <>
              <input
                type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true"
                value={pinInput} onChange={e => setPinInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && verifyPin()}
                placeholder="קוד גישה"
                style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '18px', marginBottom: '12px' }}
                autoFocus
              />
              {pinError && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{pinError}</div>}
              <button onClick={verifyPin} style={{ ...btnPrim, width: '100%' }}>🔓 פתח כספת</button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Unlocked vault ──
  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🔓</span>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>כספת סיסמאות</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({items.length} פריטים)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setChangingPin(true); setNewPin(''); setNewPinConfirm(''); setPinError('') }} style={{ ...btnSec, padding: '7px 14px', fontSize: '12px' }}>🔑 שינוי קוד</button>
          <button onClick={() => { setUnlocked(false); setPinInput(''); setPinError('') }} style={{ ...btnSec, padding: '7px 14px', fontSize: '12px' }}>🔒 נעל</button>
          <button onClick={openAdd} style={{ ...btnPrim, padding: '7px 16px', fontSize: '13px' }}>+ הוסף</button>
        </div>
      </div>

      {/* Change PIN modal */}
      {changingPin && (
        <>
          <div onClick={() => setChangingPin(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 299 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', borderRadius: '14px', padding: '28px', width: 'min(320px, calc(100vw - 32px))', zIndex: 300, direction: 'rtl', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '20px' }}>🔑 שינוי קוד כספת</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelSt}>קוד נוכחי</label>
                <input type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '16px' }} value={oldPinInput} onChange={e => setOldPinInput(e.target.value)} autoFocus />
              </div>
              <div>
                <label style={labelSt}>קוד חדש (מינימום 4)</label>
                <input type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '16px' }} value={newPin} onChange={e => setNewPin(e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>אמת קוד חדש</label>
                <input type="password" inputMode="numeric" maxLength={12} autoComplete="new-password" readOnly onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.removeAttribute('readonly')} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" style={{ ...inputSt, textAlign: 'center', letterSpacing: '4px', fontSize: '16px' }} value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && changePin()} />
              </div>
              {pinError && <div style={{ color: 'var(--danger)', fontSize: '12px' }}>{pinError}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={changePin} style={{ ...btnPrim, flex: 1 }}>שמור קוד</button>
                <button onClick={() => { setChangingPin(false); setOldPinInput(''); setNewPin(''); setNewPinConfirm(''); setPinError('') }} style={btnSec}>ביטול</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '16px' }}>{editItem ? 'עריכת פריט' : 'פריט חדש'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelSt}>כותרת *</label>
              <input style={inputSt} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="לדוגמה: בנק הפועלים" />
            </div>
            <div>
              <label style={labelSt}>קטגוריה</label>
              <select style={inputSt} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>שם משתמש / מספר חשבון</label>
              <input style={inputSt} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="user@example.com" dir="ltr" />
            </div>
            <div>
              <label style={labelSt}>סיסמא / PIN / קוד</label>
              <input style={inputSt} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" dir="ltr" />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelSt}>URL / קישור (אופציונלי)</label>
            <input style={inputSt} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." dir="ltr" />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelSt}>הערות</label>
            <textarea style={{ ...inputSt, height: '70px', resize: 'vertical' } as React.CSSProperties} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="פרטים נוספים..." />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>{saving ? 'שומר...' : '💾 שמור'}</button>
            <button onClick={() => setShowForm(false)} style={btnSec}>ביטול</button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 && !showForm && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '12px', fontSize: '13px' }}>
          הכספת ריקה. לחץ "+ הוסף" כדי לשמור סיסמא ראשונה.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map(item => {
          const isRevealed = revealed.has(item.id)
          return (
            <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '22px', marginTop: '2px' }}>{CAT_LABELS[item.category]?.split(' ')[0] ?? '🔑'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>{item.title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {item.username && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '80px' }}>שם משתמש:</span>
                        <code style={{ flex: 1, minWidth: '80px', direction: 'ltr', fontSize: '12px', wordBreak: 'break-all' }}>{item.username}</code>
                        <button onClick={() => copyText(item.username!, 'שם משתמש')} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>📋 העתק</button>
                      </div>
                    )}
                    {item.password && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '80px' }}>סיסמא:</span>
                        <code style={{ flex: 1, minWidth: '80px', direction: 'ltr', fontSize: '12px', letterSpacing: isRevealed ? 'normal' : '2px', wordBreak: 'break-all' }}>
                          {isRevealed ? item.password : '•'.repeat(Math.min(item.password.length, 12))}
                        </code>
                        <button onClick={() => toggleReveal(item.id)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>{isRevealed ? '🙈 הסתר' : '👁 הצג'}</button>
                        <button onClick={() => copyText(item.password!, 'סיסמא')} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>📋 העתק</button>
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.notes}</div>
                    )}
                  </div>
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                    style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                  >⋮</button>
                  {menuOpen === item.id && (
                    <>
                      <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                      <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden', zIndex: 50, minWidth: '100px' }}>
                        <button onClick={() => { openEdit(item); setMenuOpen(null) }} style={{ width: '100%', textAlign: 'right', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          ✏️ ערוך
                        </button>
                        <button onClick={() => { deleteItem(item.id); setMenuOpen(null) }} style={{ width: '100%', textAlign: 'right', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border)' }}>
                          🗑 מחק
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── LandingTab ──────────────────────────────────────────────────────────────

type LandingSub = 'services' | 'promotions' | 'prices'

interface LandingService { id: string; name: string; description: string | null; icon: string | null; image_url: string | null; sort_order: number; is_active: boolean }
interface LandingPromotion { id: string; title: string; description: string | null; image_url: string | null; link_url: string | null; start_date: string | null; end_date: string | null; sort_order: number; is_active: boolean }
interface LandingPrice { id: string; category: string; service_name: string; price: number | null; price_note: string | null; sort_order: number; is_active: boolean }

function LandingTab({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [sub, setSub] = useState<LandingSub>('services')

  const subTabs: { key: LandingSub; label: string }[] = [
    { key: 'services',   label: '🔧 שירותים' },
    { key: 'promotions', label: '🏷️ מבצעים' },
    { key: 'prices',     label: '💲 מחירון' },
  ]

  return (
    <div style={{ maxWidth: '720px' }}>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        ניהול תוכן דף הנחיתה הציבורי. פרטי העסק (שם, טלפון, כתובת) מנוהלים בטאב &quot;פרטי עסק&quot;.
      </p>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)} style={{
            padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: '13px', fontWeight: sub === t.key ? 700 : 400,
            color: sub === t.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: sub === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>
      {sub === 'services'   && <ServicesSection   supabase={supabase} tenantId={tenantId} showToast={showToast} />}
      {sub === 'promotions' && <PromotionsSection supabase={supabase} tenantId={tenantId} showToast={showToast} />}
      {sub === 'prices'     && <PricesSection     supabase={supabase} tenantId={tenantId} showToast={showToast} />}
    </div>
  )
}

function ServicesSection({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [items, setItems] = useState<LandingService[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<LandingService | null>(null)
  const [form, setForm] = useState({ name: '', description: '', icon: '', image_url: null as string | null, sort_order: '0', is_active: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').eq('tenant_id', tenantId).order('sort_order')
    setItems(data ?? [])
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ name: '', description: '', icon: '', image_url: null, sort_order: String(items.length * 10), is_active: true }); setEditItem(null); setShowForm(true) }
  function openEdit(i: LandingService) { setForm({ name: i.name, description: i.description ?? '', icon: i.icon ?? '', image_url: i.image_url ?? null, sort_order: String(i.sort_order), is_active: i.is_active }); setEditItem(i); setShowForm(true) }

  function toDriveDirectUrl(url: string): string {
    const m = url.match(/\/file\/d\/([^/]+)/)
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`
    return url
  }

  function onImageUrlInput(raw: string) {
    const url = toDriveDirectUrl(raw.trim())
    setForm(f => ({ ...f, image_url: url || null }))
  }

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) { showToast('התמונה גדולה מדי (מקסימום 500KB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => { setForm(f => ({ ...f, image_url: ev.target?.result as string })) }
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!form.name.trim()) { showToast('חובה שם', 'error'); return }
    setSaving(true)
    const payload = { tenant_id: tenantId, name: form.name.trim(), description: form.description.trim() || null, icon: form.icon.trim() || null, image_url: form.image_url ?? null, sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active }
    if (editItem) await supabase.from('services').update(payload).eq('id', editItem.id)
    else await supabase.from('services').insert(payload)
    setSaving(false); setShowForm(false); load(); showToast(editItem ? 'עודכן' : 'נוסף', 'success')
  }

  async function del(id: string) { await supabase.from('services').delete().eq('id', id); load(); showToast('נמחק', 'success') }
  async function toggleActive(i: LandingService) { await supabase.from('services').update({ is_active: !i.is_active }).eq('id', i.id); load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>שירותים ({items.length})</span>
        <button onClick={openAdd} style={btnPrim}>+ הוסף שירות</button>
      </div>
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={labelSt}>שם *</label><input style={inputSt} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: כיוון פרונט" /></div>
            <div><label style={labelSt}>אייקון (אימוג׳י) — אם אין תמונה</label><input style={{ ...inputSt, fontSize: '20px' }} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="🔧" /></div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelSt}>תמונה לשירות (עדיפה על אייקון)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {form.image_url && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={form.image_url} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <button onClick={() => setForm(f => ({ ...f, image_url: null }))} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                <input type="file" accept="image/*" onChange={onImageChange} style={{ fontSize: '13px' }} />
                <input
                  style={{ ...inputSt, fontSize: '12px' }}
                  placeholder="או הדבק קישור תמונה / Google Drive..."
                  defaultValue={form.image_url && !form.image_url.startsWith('data:') ? form.image_url : ''}
                  onBlur={e => { if (!form.image_url?.startsWith('data:')) onImageUrlInput(e.target.value) }}
                />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}><label style={labelSt}>תיאור</label><input style={inputSt} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור קצר של השירות..." /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}><label style={labelSt}>סדר הצגה</label><input type="number" style={inputSt} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '13px' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span className="toggle-track" />
              </label>
              <span>פעיל</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>{saving ? 'שומר...' : '💾 שמור'}</button>
            <button onClick={() => setShowForm(false)} style={btnSec}>ביטול</button>
          </div>
        </div>
      )}
      {items.length === 0 && !showForm && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px', border: '2px dashed var(--border)', borderRadius: '10px' }}>אין שירותים — לחץ &quot;+ הוסף שירות&quot;</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map(i => (
          <div key={i.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', opacity: i.is_active ? 1 : .55 }}>
            {i.image_url
              ? <img src={i.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
              : <span style={{ fontSize: '22px' }}>{i.icon ?? '🔧'}</span>
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{i.name}</div>
              {i.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{i.description}</div>}
            </div>
            <button onClick={() => toggleActive(i)} style={{ ...btnSec, padding: '4px 10px', fontSize: '11px', color: i.is_active ? 'var(--primary)' : 'var(--text-muted)' }}>{i.is_active ? '✓ פעיל' : 'מושבת'}</button>
            <button onClick={() => openEdit(i)} style={{ ...btnSec, padding: '4px 10px', fontSize: '11px' }}>✏️</button>
            <button onClick={() => del(i.id)} style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: '6px', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PromotionsSection({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [items, setItems] = useState<LandingPromotion[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<LandingPromotion | null>(null)
  const [form, setForm] = useState({ title: '', description: '', image_url: null as string | null, link_url: '', start_date: '', end_date: '', sort_order: '0', is_active: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('promotions').select('*').eq('tenant_id', tenantId).order('sort_order')
    setItems(data ?? [])
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function toDriveDirectUrl(url: string): string {
    const m = url.match(/\/file\/d\/([^/]+)/)
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`
    return url
  }

  function onImageUrlInput(raw: string) {
    const url = toDriveDirectUrl(raw.trim())
    setForm(f => ({ ...f, image_url: url || null }))
  }

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) { showToast('התמונה גדולה מדי (מקסימום 500KB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => { setForm(f => ({ ...f, image_url: ev.target?.result as string })) }
    reader.readAsDataURL(file)
  }

  function openAdd() { setForm({ title: '', description: '', image_url: null, link_url: '', start_date: new Date().toISOString().slice(0,10), end_date: '', sort_order: '0', is_active: true }); setEditItem(null); setShowForm(true) }
  function openEdit(i: LandingPromotion) { setForm({ title: i.title, description: i.description ?? '', image_url: i.image_url ?? null, link_url: i.link_url ?? '', start_date: i.start_date ?? '', end_date: i.end_date ?? '', sort_order: String(i.sort_order), is_active: i.is_active }); setEditItem(i); setShowForm(true) }

  async function save() {
    if (!form.title.trim()) { showToast('חובה כותרת', 'error'); return }
    setSaving(true)
    const payload = { tenant_id: tenantId, title: form.title.trim(), description: form.description.trim() || null, image_url: form.image_url ?? null, link_url: form.link_url.trim() || null, start_date: form.start_date || null, end_date: form.end_date || null, sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active }
    if (editItem) await supabase.from('promotions').update(payload).eq('id', editItem.id)
    else await supabase.from('promotions').insert(payload)
    setSaving(false); setShowForm(false); load(); showToast(editItem ? 'עודכן' : 'נוסף', 'success')
  }

  async function del(id: string) { await supabase.from('promotions').delete().eq('id', id); load(); showToast('נמחק', 'success') }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>מבצעים ({items.length})</span>
        <button onClick={openAdd} style={btnPrim}>+ הוסף מבצע</button>
      </div>
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '10px' }}><label style={labelSt}>כותרת *</label><input style={inputSt} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="לדוגמה: 20% הנחה על צמיגים" /></div>
          <div style={{ marginBottom: '10px' }}><label style={labelSt}>תיאור</label><textarea style={{ ...inputSt, height: '60px', resize: 'vertical' } as React.CSSProperties} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="פרטי המבצע..." /></div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelSt}>תמונה למבצע (אופציונלי)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {form.image_url && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={form.image_url} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <button onClick={() => setForm(f => ({ ...f, image_url: null }))} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                <input type="file" accept="image/*" onChange={onImageChange} style={{ fontSize: '13px' }} />
                <input
                  style={{ ...inputSt, fontSize: '12px' }}
                  placeholder="או הדבק קישור תמונה / Google Drive..."
                  defaultValue={form.image_url && !form.image_url.startsWith('data:') ? form.image_url : ''}
                  onBlur={e => { if (!form.image_url?.startsWith('data:')) onImageUrlInput(e.target.value) }}
                />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}><label style={labelSt}>קישור (כפתור "למידע נוסף")</label><input style={inputSt} value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={labelSt}>מתאריך</label><input type="date" style={inputSt} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><label style={labelSt}>עד תאריך</label><input type="date" style={inputSt} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}><label style={labelSt}>סדר הצגה</label><input type="number" style={inputSt} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '13px' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span className="toggle-track" />
              </label>
              <span>פעיל</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>{saving ? 'שומר...' : '💾 שמור'}</button>
            <button onClick={() => setShowForm(false)} style={btnSec}>ביטול</button>
          </div>
        </div>
      )}
      {items.length === 0 && !showForm && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px', border: '2px dashed var(--border)', borderRadius: '10px' }}>אין מבצעים — לחץ &quot;+ הוסף מבצע&quot;</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map(i => (
          <div key={i.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', opacity: i.is_active ? 1 : .55 }}>
            {i.image_url
              ? <img src={i.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
              : <span style={{ fontSize: '22px' }}>🏷️</span>
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{i.title}</div>
              {i.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{i.description}</div>}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {i.start_date && `מ-${i.start_date}`}{i.end_date && ` עד ${i.end_date}`}
              </div>
            </div>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: i.is_active ? '#dcfce7' : '#f1f5f9', color: i.is_active ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>{i.is_active ? 'פעיל' : 'מושבת'}</span>
            <button onClick={() => openEdit(i)} style={{ ...btnSec, padding: '4px 10px', fontSize: '11px' }}>✏️</button>
            <button onClick={() => del(i.id)} style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: '6px', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PricesSection({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [items, setItems] = useState<LandingPrice[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<LandingPrice | null>(null)
  const [form, setForm] = useState({ category: '', service_name: '', price: '', price_note: '', sort_order: '0', is_active: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('price_list').select('*').eq('tenant_id', tenantId).order('category').order('sort_order')
    setItems(data ?? [])
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ category: '', service_name: '', price: '', price_note: '', sort_order: '0', is_active: true }); setEditItem(null); setShowForm(true) }
  function openEdit(i: LandingPrice) { setForm({ category: i.category, service_name: i.service_name, price: i.price != null ? String(i.price) : '', price_note: i.price_note ?? '', sort_order: String(i.sort_order), is_active: i.is_active }); setEditItem(i); setShowForm(true) }

  async function save() {
    if (!form.service_name.trim() || !form.category.trim()) { showToast('חובה קטגוריה ושם שירות', 'error'); return }
    setSaving(true)
    const payload = { tenant_id: tenantId, category: form.category.trim(), service_name: form.service_name.trim(), price: form.price ? parseFloat(form.price) : null, price_note: form.price_note.trim() || null, sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active }
    if (editItem) await supabase.from('price_list').update(payload).eq('id', editItem.id)
    else await supabase.from('price_list').insert(payload)
    setSaving(false); setShowForm(false); load(); showToast(editItem ? 'עודכן' : 'נוסף', 'success')
  }

  async function del(id: string) { await supabase.from('price_list').delete().eq('id', id); load(); showToast('נמחק', 'success') }

  // Group by category
  const categories = [...new Set(items.map(i => i.category))]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>מחירון ({items.length} פריטים)</span>
        <button onClick={openAdd} style={btnPrim}>+ הוסף פריט</button>
      </div>
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={labelSt}>קטגוריה *</label><input style={inputSt} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="לדוגמה: כיוון פרונט" list="cat-list" /><datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
            <div><label style={labelSt}>שם שירות *</label><input style={inputSt} value={form.service_name} onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))} placeholder="לדוגמה: רכב פרטי" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={labelSt}>מחיר (₪)</label><input type="number" style={inputSt} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" dir="ltr" /></div>
            <div><label style={labelSt}>הערת מחיר</label><input style={inputSt} value={form.price_note} onChange={e => setForm(f => ({ ...f, price_note: e.target.value }))} placeholder='לדוגמה: "החל מ-"' /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}><label style={labelSt}>סדר</label><input type="number" style={inputSt} value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '13px' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span className="toggle-track" />
              </label>
              <span>פעיל</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>{saving ? 'שומר...' : '💾 שמור'}</button>
            <button onClick={() => setShowForm(false)} style={btnSec}>ביטול</button>
          </div>
        </div>
      )}
      {items.length === 0 && !showForm && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px', border: '2px dashed var(--border)', borderRadius: '10px' }}>אין פריטים במחירון — לחץ &quot;+ הוסף פריט&quot;</div>}
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.filter(i => i.category === cat).map(i => (
              <div key={i.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', opacity: i.is_active ? 1 : .55 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{i.service_name}</span>
                  {i.price_note && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '6px' }}>{i.price_note}</span>}
                </div>
                <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '13px' }}>{i.price != null ? `₪${Number(i.price).toLocaleString('he-IL')}` : '—'}</span>
                <button onClick={() => openEdit(i)} style={{ ...btnSec, padding: '3px 8px', fontSize: '11px' }}>✏️</button>
                <button onClick={() => del(i.id)} style={{ padding: '3px 7px', border: '1px solid #fecaca', borderRadius: '5px', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── BackupTab ───────────────────────────────────────────────────────────────

const BACKUP_TABLES = [
  'tires','tire_sales','products','product_sales',
  'alignment_jobs','billing_contacts','billing_entries','billing_entry_payments','billing_items',
  'cars','car_requests','car_sale_requests',
  'customer_debts','supplier_debts','suppliers',
  'employees','salaries','scheduled_payments',
  'expense_categories','expenses','income','income_categories','recurring_expenses',
  'quotes','car_inspections','reminders',
] as const

function BackupTab({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [exporting, setExporting] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [showPassModal, setShowPassModal] = useState(false)
  const [password, setPassword] = useState('')
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doExport() {
    setExporting(true)
    try {
      const backup: Record<string, unknown[]> = { _version: 1, _exported_at: new Date().toISOString(), _tenant_id: tenantId } as never
      for (const table of BACKUP_TABLES) {
        const { data } = await supabase.from(table).select('*').eq('tenant_id', tenantId)
        backup[table] = data ?? []
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `גיבוי_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('גיבוי יוצא בהצלחה ✓', 'success')
    } catch {
      showToast('שגיאה בייצוא גיבוי', 'error')
    }
    setExporting(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setRestoreFile(f)
    setShowPassModal(true)
    e.target.value = ''
  }

  async function doRestore() {
    if (!restoreFile) return
    setRestoring(true)
    try {
      // Verify password
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { showToast('לא ניתן לאמת משתמש', 'error'); setRestoring(false); return }
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password })
      if (authErr) { showToast('סיסמה שגויה', 'error'); setRestoring(false); return }

      // Parse backup
      const text = await restoreFile.text()
      const backup = JSON.parse(text) as Record<string, unknown[]>

      // Upsert each table
      let restored = 0
      for (const table of BACKUP_TABLES) {
        const rows = backup[table]
        if (!Array.isArray(rows) || rows.length === 0) continue
        const { error } = await supabase.from(table).upsert(rows as never, { onConflict: 'id' })
        if (!error) restored += rows.length
      }

      showToast(`שוחזרו ${restored} רשומות ✓`, 'success')
      setShowPassModal(false)
      setRestoreFile(null)
      setPassword('')
    } catch {
      showToast('שגיאה בשחזור גיבוי', 'error')
    }
    setRestoring(false)
  }

  const cardSt: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '20px 24px', marginBottom: '16px',
  }

  return (
    <div>
      {/* Export */}
      <div style={cardSt}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>📤 ייצוא גיבוי מלא</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          מוריד קובץ JSON עם כל הנתונים של העסק — צמיגים, מוצרים, הוצאות, חובות, רכבים ועוד.
        </div>
        <button
          onClick={doExport}
          disabled={exporting}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: 'var(--primary)', color: '#fff', fontWeight: 700,
            fontSize: '14px', cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.7 : 1, fontFamily: 'inherit',
          }}
        >
          {exporting ? 'מייצא...' : '⬇️ ייצא גיבוי'}
        </button>
      </div>

      {/* Restore */}
      <div style={{ ...cardSt, borderColor: '#fca5a5' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>📥 שחזור גיבוי</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          מעלה קובץ גיבוי ומשחזר את הנתונים. ידרש אימות סיסמת מנהל. נתונים קיימים עם אותו מזהה יידרסו.
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '10px 20px', borderRadius: '8px',
          border: '1px solid #ef4444', color: '#ef4444',
          fontWeight: 700, fontSize: '14px', cursor: 'pointer',
          background: 'transparent', fontFamily: 'inherit',
        }}>
          📂 בחר קובץ גיבוי
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onFileChange} />
        </label>
      </div>

      {/* Password modal */}
      {showPassModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '14px', padding: '28px',
            width: '90%', maxWidth: '380px', direction: 'rtl',
          }}>
            <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '8px' }}>🔒 אימות מנהל</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              הזן את סיסמתך כדי לאשר את שחזור הגיבוי:
              <br /><strong style={{ color: '#ef4444' }}>{restoreFile?.name}</strong>
            </div>
            <input
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !restoring && password && doRestore()}
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--border)', fontSize: '14px',
                background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box', marginBottom: '16px', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowPassModal(false); setRestoreFile(null); setPassword('') }}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px',
                }}
              >
                ביטול
              </button>
              <button
                onClick={doRestore}
                disabled={restoring || !password}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 700,
                  cursor: restoring || !password ? 'not-allowed' : 'pointer',
                  opacity: restoring || !password ? 0.6 : 1,
                  fontFamily: 'inherit', fontSize: '13px',
                }}
              >
                {restoring ? 'משחזר...' : 'שחזר גיבוי'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function SettingsClient() {
  const supabase      = useRef(createClient()).current
  const { showToast } = useToast()
  const [tab,            setTab]            = useState<Tab | null>(null)
  const [tenantId,       setTenantId]       = useState<string | null>(null)
  const [myId,           setMyId]           = useState<string | null>(null)
  const [myRole,         setMyRole]         = useState<string>('employee')
  const [myModules,      setMyModules]      = useState<string[]>([])
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setMyId(data.user.id)
      supabase.from('profiles').select('tenant_id, role, allowed_modules').eq('id', data.user.id).single().then(({ data: p }) => {
        if (p) {
          setTenantId(p.tenant_id)
          setMyRole(p.role ?? 'employee')
          setMyModules(p.allowed_modules ?? [])
        }
        setLoading(false)
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin  = myRole === 'admin' || myRole === 'super_admin'
  const canVault = myRole === 'super_admin'

  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  useEffect(() => {
    if (!isAdmin || !tenantId) return
    fetch(`/api/drive/status?tenant_id=${tenantId}`)
      .then(r => r.json()).then(d => setDriveConnected(d.connected)).catch(() => setDriveConnected(false))
    // Handle redirect back from OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive') === 'connected') { setDriveConnected(true); window.history.replaceState({}, '', '/settings') }
    if (params.get('drive') === 'error') { showToast('שגיאה בחיבור Drive', 'error'); window.history.replaceState({}, '', '/settings') }
  }, [isAdmin, tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'business', label: 'פרטי עסק',    icon: '🏢' },
    { key: 'users',    label: 'משתמשים',      icon: '👥' },
    { key: 'landing',  label: 'דף נחיתה',     icon: '🌐' },
    ...(canVault ? [{ key: 'vault' as Tab, label: 'כספת סיסמאות', icon: '🔒' }] : []),
    ...(isAdmin ? [{ key: 'backup' as Tab, label: 'גיבוי', icon: '🗄️' }] : []),
  ]

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>
  if (!tenantId || !myId) return null

  function toggleTab(key: Tab) {
    setTab(prev => prev === key ? null : key)
  }

  const tabContent: Record<Tab, React.ReactNode> = {
    business: <BusinessTab supabase={supabase} tenantId={tenantId} showToast={showToast} />,
    users:    <UsersTab    supabase={supabase} tenantId={tenantId} myId={myId} showToast={showToast} />,
    landing:  <LandingTab  supabase={supabase} tenantId={tenantId} showToast={showToast} />,
    vault:    canVault ? <VaultTab supabase={supabase} tenantId={tenantId} showToast={showToast} /> : null,
    backup:   isAdmin ? <BackupTab supabase={supabase} tenantId={tenantId} showToast={showToast} /> : null,
  }

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#64748b,#94a3b8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px #64748b44' }}><svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></div>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>הגדרות</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>ניהול עסק, משתמשים והרשאות</p>
        </div>
      </div>

      {/* Google Drive status — admins only */}
      {isAdmin && driveConnected !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
          background: driveConnected ? '#f0fdf6' : '#fffbeb',
          border: `1px solid ${driveConnected ? '#bbf7d0' : '#fcd34d'}`,
          borderRadius: '10px', padding: '12px 16px',
        }}>
          <span style={{ fontSize: '22px' }}>📂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>
              Google Drive — {driveConnected ? '✓ מחובר' : 'לא מחובר'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {driveConnected ? 'תמונות ומסמכים מועלים ישירות לדרייב של העסק' : 'חבר כדי להעלות תמונות ומסמכים ישירות מהמערכת'}
            </div>
          </div>
          {!driveConnected && tenantId && (
            <a
              href={`/api/drive/auth?tenant_id=${tenantId}`}
              style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}
            >
              חבר Drive →
            </a>
          )}
        </div>
      )}

      {/* Desktop: horizontal scrollable tabs */}
      <div className="settings-desktop-tabs scrollable-tabs" style={{ marginBottom: '24px', display: 'flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => toggleTab(t.key)}
            style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '13px', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
              background: tab === t.key ? '#fff' : 'transparent',
              borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px',
              whiteSpace: 'nowrap', flexShrink: 0,
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              transition: 'all .15s',
            }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: accordion sections */}
      <div className="settings-mobile-accordion">
        {tabs.map(t => (
          <div key={t.key} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0' }}>
            <button
              onClick={() => toggleTab(t.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '14px', fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? 'var(--primary)' : 'var(--text)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t.icon}</span> {t.label}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tab === t.key ? '▲' : '▼'}</span>
            </button>
            {tab === t.key && (
              <div className="settings-accordion-content" style={{ paddingBottom: '20px' }}>
                {tabContent[t.key]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop content */}
      <div className="settings-desktop-content">
        {tab === 'business' && tabContent.business}
        {tab === 'users'    && tabContent.users}
        {tab === 'landing'  && tabContent.landing}
        {tab === 'backup'   && tabContent.backup}
        {/* VaultTab always mounted to preserve unlock state */}
        {canVault && (
          <div style={{ display: tab === 'vault' ? 'block' : 'none' }}>
            {tabContent.vault}
          </div>
        )}
      </div>
    </div>
  )
}
