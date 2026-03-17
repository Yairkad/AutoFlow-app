'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void

// ── Types ──────────────────────────────────────────────────────────────────

interface Tenant {
  id: string
  name: string
  sub_title: string | null
  phone: string | null
  address: string | null
  tax_id: string | null
  license_number: string | null
  logo_base64: string | null
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

type Tab = 'business' | 'users' | 'invite' | 'vault'

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
  { key: 'settings',   label: '⚙️ הגדרות' },
]

const inputSt: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', background: 'var(--bg)', direction: 'rtl', width: '100%', boxSizing: 'border-box',
}
const labelSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }
const btnPrim: React.CSSProperties = {
  padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none',
  borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnSec: React.CSSProperties = {
  padding: '9px 20px', background: 'transparent', color: 'var(--text-muted)',
  border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
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
  const [tenant,  setTenant]  = useState<Tenant | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
    if (data) { setTenant(data); setLogoPreview(data.logo_base64) }
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    }).eq('id', tenantId)
    setSaving(false)
    if (error) showToast('שגיאה בשמירה', 'error')
    else showToast('נשמר בהצלחה', 'success')
  }

  if (!tenant) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: 80, height: 80, borderRadius: '14px', border: '2px dashed var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', overflow: 'hidden', background: 'var(--bg)', flexShrink: 0,
          }}
          title="לחץ לשינוי לוגו"
        >
          {logoPreview
            ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: '28px' }}>🏢</span>
          }
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>לוגו העסק</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>PNG / JPG עד 500KB</div>
          <button onClick={() => fileRef.current?.click()} style={btnSec}>בחר תמונה</button>
          {logoPreview && (
            <button
              onClick={() => { setLogoPreview(null); setTenant(t => t ? { ...t, logo_base64: null } : t) }}
              style={{ ...btnSec, marginRight: '8px', color: '#dc2626', borderColor: '#fecaca' }}
            >הסר</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} style={{ display: 'none' }} />
      </div>

      {field('שם עסק *', (
        <input style={inputSt} value={tenant.name} onChange={e => setTenant(t => t ? { ...t, name: e.target.value } : t)} placeholder="שם העסק" />
      ))}
      {field('כותרת משנה', (
        <input style={inputSt} value={tenant.sub_title ?? ''} onChange={e => setTenant(t => t ? { ...t, sub_title: e.target.value } : t)} placeholder="לדוגמה: מוסך ופנצריה" />
      ))}
      {field('טלפון', (
        <input style={inputSt} value={tenant.phone ?? ''} onChange={e => setTenant(t => t ? { ...t, phone: e.target.value } : t)} placeholder="050-0000000" dir="ltr" />
      ))}
      {field('כתובת', (
        <input style={inputSt} value={tenant.address ?? ''} onChange={e => setTenant(t => t ? { ...t, address: e.target.value } : t)} placeholder="רחוב, עיר" />
      ))}
      {field('ח.פ / ע.מ', (
        <input style={inputSt} value={tenant.tax_id ?? ''} onChange={e => setTenant(t => t ? { ...t, tax_id: e.target.value } : t)} placeholder="מספר עוסק" dir="ltr" />
      ))}
      {field('מספר רישיון / פרט נוסף', (
        <input style={inputSt} value={tenant.license_number ?? ''} onChange={e => setTenant(t => t ? { ...t, license_number: e.target.value } : t)} placeholder="לדוגמה: מס׳ רישיון מוסך 41346" />
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px' }}>
        <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? .7 : 1 }}>
          {saving ? 'שומר...' : '💾 שמור שינויים'}
        </button>
      </div>
    </div>
  )
}

// ── UsersTab ───────────────────────────────────────────────────────────────

function UsersTab({ supabase, tenantId, myId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; myId: string; showToast: ToastFn }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Profile>>({})
  const [saving,   setSaving]   = useState(false)

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

  const roleLabel = (r: string) => r === 'admin' ? '👑 מנהל' : '👤 עובד'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id={`active-${p.id}`} checked={editData.is_active} onChange={e => setEditData(d => ({ ...d, is_active: e.target.checked }))} />
                <label htmlFor={`active-${p.id}`} style={{ fontSize: '13px', cursor: 'pointer' }}>משתמש פעיל</label>
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
                  {!p.is_active && <span style={{ color: '#dc2626' }}>מושבת</span>}
                </div>
              </div>
              <button onClick={() => startEdit(p)} style={{ ...btnSec, padding: '6px 14px', fontSize: '12px' }}>ערוך</button>
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

// ── InviteTab ──────────────────────────────────────────────────────────────

function InviteTab({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const [tokens,    setTokens]    = useState<InviteToken[]>([])
  const [creating,  setCreating]  = useState(false)
  const [expiryDays, setExpiryDays] = useState('7')

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

  async function createToken() {
    setCreating(true)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)
    const days  = parseInt(expiryDays) || 7
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString()
    const { error } = await supabase.from('registration_tokens').insert({
      tenant_id: tenantId, token, used: false, expires_at: expiresAt,
    })
    setCreating(false)
    if (error) showToast('שגיאה ביצירת קישור', 'error')
    else { showToast('קישור נוצר', 'success'); load() }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/register?token=${token}`
    navigator.clipboard.writeText(url).then(() => showToast('קישור הועתק', 'success'))
  }

  async function revokeToken(id: string) {
    await supabase.from('registration_tokens').delete().eq('id', id)
    load()
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const isExpired  = (t: InviteToken) => t.expires_at ? new Date(t.expires_at) < new Date() : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      {/* Create */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>הזמן עובד חדש</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          צור קישור רישום חד-פעמי ושלח לעובד. הוא יירשם ויחובר לחשבון העסק שלך.
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>תוקף הקישור</label>
            <select style={inputSt} value={expiryDays} onChange={e => setExpiryDays(e.target.value)}>
              <option value="1">יום אחד</option>
              <option value="3">3 ימים</option>
              <option value="7">שבוע</option>
              <option value="30">חודש</option>
            </select>
          </div>
          <button onClick={createToken} disabled={creating} style={{ ...btnPrim, opacity: creating ? .7 : 1, whiteSpace: 'nowrap' }}>
            {creating ? 'יוצר...' : '🔗 צור קישור'}
          </button>
        </div>
      </div>

      {/* List */}
      {tokens.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>קישורים קיימים</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tokens.map(t => {
              const expired = isExpired(t)
              const status  = t.used ? 'נוצל' : expired ? 'פג תוקף' : 'פעיל'
              const statusColor = t.used ? '#94a3b8' : expired ? '#dc2626' : '#1a9e5c'
              return (
                <div key={t.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                  opacity: t.used || expired ? .65 : 1,
                }}>
                  <div style={{ flex: 1 }}>
                    <code style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {t.token}
                    </code>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      נוצר: {formatDate(t.created_at)}
                      {t.expires_at && ` · פג: ${formatDate(t.expires_at)}`}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor }}>{status}</span>
                  {!t.used && !expired && (
                    <button onClick={() => copyLink(t.token)} style={{ ...btnSec, padding: '5px 12px', fontSize: '12px' }}>העתק</button>
                  )}
                  <button onClick={() => revokeToken(t.id)} style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: '6px', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}>×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
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
      setPinError('קוד שגוי')
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
              {pinError && <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{pinError}</div>}
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
              {pinError && <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{pinError}</div>}
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
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', borderRadius: '14px', padding: '28px', width: '320px', zIndex: 300, direction: 'rtl', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
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
              {pinError && <div style={{ color: '#dc2626', fontSize: '12px' }}>{pinError}</div>}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '110px' }}>שם משתמש:</span>
                        <code style={{ flex: 1, direction: 'ltr', fontSize: '12px' }}>{item.username}</code>
                        <button onClick={() => copyText(item.username!, 'שם משתמש')} style={{ padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontSize: '11px' }}>העתק</button>
                      </div>
                    )}
                    {item.password && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '110px' }}>סיסמא:</span>
                        <code style={{ flex: 1, direction: 'ltr', fontSize: '12px', letterSpacing: isRevealed ? 'normal' : '2px' }}>
                          {isRevealed ? item.password : '•'.repeat(Math.min(item.password.length, 12))}
                        </code>
                        <button onClick={() => toggleReveal(item.id)} style={{ padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontSize: '11px' }}>{isRevealed ? '🙈' : '👁'}</button>
                        <button onClick={() => copyText(item.password!, 'סיסמא')} style={{ padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontSize: '11px' }}>העתק</button>
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
                        <button onClick={() => { deleteItem(item.id); setMenuOpen(null) }} style={{ width: '100%', textAlign: 'right', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border)' }}>
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

// ── Main ───────────────────────────────────────────────────────────────────

export default function SettingsClient() {
  const supabase      = useRef(createClient()).current
  const { showToast } = useToast()
  const [tab,      setTab]      = useState<Tab>('business')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [myId,     setMyId]     = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setMyId(data.user.id)
      supabase.from('profiles').select('tenant_id').eq('id', data.user.id).single().then(({ data: p }) => {
        if (p) setTenantId(p.tenant_id)
        setLoading(false)
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'business', label: 'פרטי עסק',    icon: '🏢' },
    { key: 'users',    label: 'משתמשים',      icon: '👥' },
    { key: 'invite',   label: 'הזמנת עובד',   icon: '🔗' },
    { key: 'vault',    label: 'כספת סיסמאות', icon: '🔒' },
  ]

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>
  if (!tenantId || !myId) return null

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>⚙️ הגדרות</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>ניהול עסק, משתמשים והרשאות</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '13px', fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'business' && <BusinessTab supabase={supabase} tenantId={tenantId} showToast={showToast} />}
      {tab === 'users'    && <UsersTab    supabase={supabase} tenantId={tenantId} myId={myId} showToast={showToast} />}
      {tab === 'invite'   && <InviteTab   supabase={supabase} tenantId={tenantId} showToast={showToast} />}
      {/* VaultTab is always mounted so unlocked/hasPinSet state survives tab switches */}
      <div style={{ display: tab === 'vault' ? 'block' : 'none' }}>
        <VaultTab supabase={supabase} tenantId={tenantId} showToast={showToast} />
      </div>
    </div>
  )
}
