'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import { fuzzyIncludes } from '@/lib/search/fuzzy'

// One list of tasks (the old "reminders" and "tasks" merged, 2026-10). Every task has a status —
// פתוח / בטיפול / בוצע — and stays in the list with that tag; progress is logged as updates.
// Rows live in `reminders`; is_done mirrors status === 'closed' for the dashboard panels.

type Priority   = 'high' | 'medium' | 'low'
type TaskStatus = 'open' | 'in_progress' | 'closed'
type View       = 'active' | 'all' | 'closed'
type Due        = '' | 'today' | 'week' | 'overdue'

interface Task {
  id:         string
  type:       'reminder' | 'task' | null
  title:      string
  due_date:   string | null
  due_time:   string | null
  priority:   Priority
  is_done:    boolean
  status:     TaskStatus | null
  phone:      string | null
  category:   string | null
  notes:      string | null
  created_at: string
}

interface TaskUpdate { id: string; reminder_id: string; author: string | null; body: string; created_at: string }

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  open:        { label: 'פתוח',  bg: 'var(--bg-soft)',      fg: 'var(--text-muted)' },
  in_progress: { label: 'בטיפול', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  closed:      { label: 'בוצע',  bg: 'var(--success-soft)', fg: 'var(--success)' },
}
const PRIORITY_LABEL: Record<Priority, string> = { high: 'דחוף', medium: 'רגיל', low: 'נמוך' }

const statusOf = (t: Task): TaskStatus => t.is_done ? 'closed' : (t.status ?? 'open')

interface FormState { title: string; due_date: string; due_time: string; priority: Priority; status: TaskStatus; phone: string; category: string; notes: string }
const EMPTY_FORM: FormState = { title: '', due_date: '', due_time: '', priority: 'medium', status: 'open', phone: '', category: '', notes: '' }

function todayISO()     { return new Date().toISOString().split('T')[0] }
function weekLaterISO() { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] }
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('he-IL') : ''
const fmtStamp = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function RemindersClient() {
  const supabase  = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [items, setItems]       = useState<Task[]>([])
  const [updates, setUpdates]   = useState<TaskUpdate[]>([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<View>('active')
  const [search, setSearch]     = useState('')
  const [due, setDue]           = useState<Due>('')
  const [category, setCategory] = useState('')
  const [openId, setOpenId]     = useState<string | null>(null)
  const [draft, setDraft]       = useState<Record<string, string>>({})   // update being typed, per task

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const [{ data }, { data: ups, error: upErr }] = await Promise.all([
      supabase.from('reminders').select('*').eq('tenant_id', profile.tenantId).order('created_at', { ascending: false }),
      supabase.from('reminder_updates').select('id, reminder_id, author, body, created_at').eq('tenant_id', profile.tenantId).order('created_at'),
    ])
    if (upErr) console.error('[tasks] updates', upErr.message)
    setItems((data ?? []) as Task[])
    setUpdates((ups ?? []) as TaskUpdate[])
    setLoading(false)
  }, [supabase, profile])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const ch = supabase.channel('tasks-client')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminder_updates' }, load)
      .subscribe()
    return () => { clearTimeout(first); supabase.removeChannel(ch) }
  }, [load, supabase])
  // Other devices' changes show up without a page refresh (realtime alone is unreliable on Netfree)
  useLiveRefresh(load)

  // ── List ─────────────────────────────────────────────────────────────────
  const today = todayISO(), weekLater = weekLaterISO()
  const categories = [...new Set(items.map(i => i.category).filter(Boolean) as string[])].sort()
  const po: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  const so: Record<TaskStatus, number> = { in_progress: 0, open: 1, closed: 2 }
  const shown = items
    .filter(t => view === 'all' || (view === 'closed' ? statusOf(t) === 'closed' : statusOf(t) !== 'closed'))
    .filter(t => !due || (t.due_date && (due === 'today' ? t.due_date === today : due === 'week' ? t.due_date >= today && t.due_date <= weekLater : t.due_date < today && statusOf(t) !== 'closed')))
    .filter(t => !category || t.category === category)
    .filter(t => !search.trim() || fuzzyIncludes([t.title, t.notes, t.category, t.phone].filter(Boolean).join(' '), search))
    .sort((a, b) => so[statusOf(a)] - so[statusOf(b)] || (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || (po[a.priority] ?? 1) - (po[b.priority] ?? 1))
  const counts = {
    active: items.filter(t => statusOf(t) !== 'closed').length,
    progress: items.filter(t => statusOf(t) === 'in_progress').length,
    closed: items.filter(t => statusOf(t) === 'closed').length,
  }
  const updatesOf = (id: string) => updates.filter(u => u.reminder_id === id)

  // ── Actions ──────────────────────────────────────────────────────────────
  async function setStatus(t: Task, status: TaskStatus) {
    setItems(prev => prev.map(x => x.id === t.id ? { ...x, status, is_done: status === 'closed' } : x))
    const { error } = await supabase.from('reminders').update({ status, is_done: status === 'closed', type: 'task' }).eq('id', t.id)
    if (error) { showToast('שגיאה בעדכון הסטטוס', 'error'); load() }
  }

  async function addUpdate(t: Task) {
    const body = (draft[t.id] ?? '').trim()
    if (!body || !profile) return
    const { error } = await supabase.from('reminder_updates').insert({ tenant_id: profile.tenantId, reminder_id: t.id, author: profile.fullName ?? null, body })
    if (error) { showToast('שגיאה בשמירת העדכון', 'error'); return }
    setDraft(d => ({ ...d, [t.id]: '' }))
    load()
  }

  function openAdd() { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
  function openEdit(t: Task) {
    setEditId(t.id)
    setForm({ title: t.title, due_date: t.due_date ?? '', due_time: t.due_time ?? '', priority: t.priority ?? 'medium', status: statusOf(t),
      phone: t.phone ?? '', category: t.category ?? '', notes: t.notes ?? '' })
    setModalOpen(true)
  }
  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }))

  async function handleSave() {
    if (!form.title.trim()) { showToast('חובה להזין כותרת', 'error'); return }
    if (!profile) return
    setSaving(true)
    const payload = {
      tenant_id: profile.tenantId, type: 'task', title: form.title.trim(),
      due_date: form.due_date || null, due_time: form.due_time || null, priority: form.priority,
      status: form.status, is_done: form.status === 'closed',
      phone: form.phone.trim() || null, category: form.category.trim() || null, notes: form.notes.trim() || null,
    }
    const { error } = editId
      ? await supabase.from('reminders').update(payload).eq('id', editId)
      : await supabase.from('reminders').insert(payload)
    setSaving(false)
    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    showToast(editId ? 'עודכן' : 'המשימה נוספה', 'success')
    setModalOpen(false)
    load()
  }

  async function handleDelete(t: Task) {
    if (!(await confirm({ msg: `למחוק את "${t.title}"?` }))) return
    await supabase.from('reminders').delete().eq('id', t.id)
    showToast('נמחק', 'success')
    load()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const dueLabel: Record<Exclude<Due, ''>, string> = { today: 'להיום', week: 'השבוע', overdue: 'באיחור' }
  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>}
        title="משימות"
        subtitle={`${counts.active} פתוחות · ${counts.progress} בטיפול`}
        actions={<Button onClick={openAdd}>+ משימה חדשה</Button>}
      />

      <FilterBar storageKey="tasks" search={search} onSearch={setSearch} placeholder="חיפוש משימה, הערה, טלפון..."
        chips={[
          ...(due ? [{ key: 'd', label: dueLabel[due], onRemove: () => setDue('') }] : []),
          ...(category ? [{ key: 'c', label: category, onRemove: () => setCategory('') }] : []),
        ]}
        onClearAll={() => { setSearch(''); setDue(''); setCategory('') }}
        end={
          <div role="group" aria-label="תצוגה" style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 9 }}>
            {([['active', `פעילות (${counts.active})`], ['closed', `בוצעו (${counts.closed})`], ['all', 'הכל']] as [View, string][]).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                style={{ border: 0, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                  background: view === v ? 'var(--bg-card)' : 'transparent', color: view === v ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: view === v ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{l}</button>
            ))}
          </div>
        }>
        <select className="form-input" aria-label="תאריך יעד" style={{ width: 'auto', margin: 0 }} value={due} onChange={e => setDue(e.target.value as Due)}>
          <option value="">כל התאריכים</option><option value="today">להיום</option><option value="week">השבוע</option><option value="overdue">באיחור</option>
        </select>
        {categories.length > 0 && (
          <select className="form-input" aria-label="קטגוריה" style={{ width: 'auto', margin: 0 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">כל הקטגוריות</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </FilterBar>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>טוען...</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {view === 'closed' ? 'אין משימות שבוצעו' : 'אין משימות פתוחות'} — לחץ &quot;+ משימה חדשה&quot; כדי להוסיף.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(t => {
            const st = statusOf(t), ups = updatesOf(t.id), open = openId === t.id
            const overdue = t.due_date && t.due_date < today && st !== 'closed'
            // Urgent / overdue: the whole card in soft red, like late payments (no dot)
            const hot = st !== 'closed' && (t.priority === 'high' || !!overdue)
            return (
              <article key={t.id} style={{ background: hot ? 'var(--danger-soft)' : 'var(--bg-card)', border: `1px solid ${hot ? 'color-mix(in srgb, var(--danger) 25%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                  <input type="checkbox" checked={st === 'closed'} aria-label={st === 'closed' ? 'סמן כלא בוצע' : 'סמן כבוצע'}
                    onChange={() => setStatus(t, st === 'closed' ? 'open' : 'closed')}
                    style={{ width: 18, height: 18, accentColor: 'var(--success)', flexShrink: 0, cursor: 'pointer' }} />
                  <button type="button" onClick={() => setOpenId(open ? null : t.id)} aria-expanded={open}
                    style={{ flex: 1, minWidth: 0, textAlign: 'right', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, textDecoration: st === 'closed' ? 'line-through' : 'none', color: st === 'closed' ? 'var(--text-muted)' : hot ? 'var(--danger)' : 'var(--text)' }}>
                      {t.title}
                      {t.priority === 'high' && st !== 'closed' && <span style={{ color: 'var(--danger)', fontSize: 11.5, fontWeight: 700, marginInlineStart: 8 }}>דחוף</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: overdue ? 'var(--danger)' : 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                      {t.due_date && <span>יעד {fmtDate(t.due_date)}{t.due_time ? ` ${t.due_time}` : ''}{overdue ? ' · באיחור' : ''}</span>}
                      {t.category && <span>{t.category}</span>}
                      {t.phone && <span dir="ltr">{t.phone}</span>}
                      {ups.length > 0 && <span>{ups.length} עדכונים</span>}
                    </div>
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: STATUS[st].bg, color: STATUS[st].fg, whiteSpace: 'nowrap' }}>{STATUS[st].label}</span>
                  <RowActionsMenu align="end" actions={[
                    { key: 'edit', label: 'עריכה', icon: '✏️', onClick: () => openEdit(t) },
                    { key: 'del', label: 'מחיקה', icon: '🗑', danger: true, onClick: () => handleDelete(t) },
                  ]} />
                </div>

                {open && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px 14px 44px', paddingInlineStart: 44, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>סטטוס:</span>
                      <div role="group" aria-label="סטטוס" style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 9 }}>
                        {(Object.keys(STATUS) as TaskStatus[]).map(k => (
                          <button key={k} type="button" onClick={() => setStatus(t, k)} aria-pressed={st === k}
                            style={{ border: 0, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                              background: st === k ? 'var(--bg-card)' : 'transparent', color: st === k ? STATUS[k].fg : 'var(--text-muted)',
                              boxShadow: st === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{STATUS[k].label}</button>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>עדיפות: {PRIORITY_LABEL[t.priority] ?? 'רגיל'}</span>
                    </div>
                    {t.notes && <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}

                    {ups.length > 0 ? (
                      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, borderInlineStart: '2px solid var(--primary-soft)', paddingInlineStart: 12 }}>
                        {ups.map(u => (
                          <li key={u.id}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtStamp(u.created_at)}{u.author ? ` · ${u.author}` : ''}</div>
                            <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{u.body}</div>
                          </li>
                        ))}
                      </ol>
                    ) : <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>אין עדיין עדכונים</p>}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" aria-label="עדכון חדש" placeholder="הוסף עדכון — מה התקדם?"
                        value={draft[t.id] ?? ''} onChange={e => setDraft(d => ({ ...d, [t.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addUpdate(t) }} style={{ margin: 0 }} />
                      <Button size="sm" onClick={() => addUpdate(t)} disabled={!(draft[t.id] ?? '').trim()}>הוסף עדכון</Button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'עריכת משימה' : 'משימה חדשה'} maxWidth={500}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>ביטול</Button>
          <Button onClick={handleSave} loading={saving}>שמור</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label" htmlFor="task-title">כותרת *</label>
            <input id="task-title" className="form-input" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="לדוגמה: להזמין צמיגים מהספק" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label" htmlFor="task-status">סטטוס</label>
              <select id="task-status" className="form-input" value={form.status} onChange={e => setF('status', e.target.value as TaskStatus)}>
                <option value="open">פתוח</option><option value="in_progress">בטיפול</option><option value="closed">בוצע</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="task-priority">עדיפות</label>
              <select id="task-priority" className="form-input" value={form.priority} onChange={e => setF('priority', e.target.value as Priority)}>
                <option value="high">דחוף</option><option value="medium">רגיל</option><option value="low">נמוך</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label" htmlFor="task-date">תאריך יעד</label>
              <input id="task-date" type="date" className="form-input" value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="task-time">שעה (אופציונלי)</label>
              <input id="task-time" type="time" className="form-input" value={form.due_time} onChange={e => setF('due_time', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label" htmlFor="task-phone">טלפון (אופציונלי)</label>
              <input id="task-phone" className="form-input" type="tel" dir="ltr" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="050-1234567" />
            </div>
            <div>
              <label className="form-label" htmlFor="task-cat">קטגוריה (אופציונלי)</label>
              <input id="task-cat" className="form-input" list="task-cats" value={form.category} onChange={e => setF('category', e.target.value)} placeholder="ספק, לקוח, רכב..." />
              <datalist id="task-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="task-notes">פרטים</label>
            <textarea id="task-notes" className="form-input" style={{ minHeight: 72, resize: 'vertical' }} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="פרטים נוספים..." />
          </div>
        </div>
      </Modal>
    </div>
  )
}
