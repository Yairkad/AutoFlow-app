'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

type ItemType    = 'reminder' | 'task'
type Priority    = 'high' | 'medium' | 'low'
type TaskStatus  = 'open' | 'in_progress' | 'closed'
type ReminderFilter = 'all' | 'today' | 'week' | 'overdue'

interface ReminderItem {
  id:         string
  type:       ItemType
  title:      string
  due_date:   string | null
  due_time:   string | null
  priority:   Priority
  is_done:    boolean
  status:     TaskStatus
  phone:      string | null
  category:   string | null
  notes:      string | null
  created_at: string
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high:   'גבוהה',
  medium: 'בינונית',
  low:    'נמוכה',
}

const PRIORITY_COLOR: Record<Priority, string> = {
  high:   'var(--danger)',
  medium: 'var(--warning)',
  low:    'var(--primary)',
}

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open:        'פתוח',
  in_progress: 'בטיפול',
  closed:      'נסגר',
}

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  open:        '#64748b',
  in_progress: 'var(--warning)',
  closed:      'var(--primary)',
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  type:     ItemType
  title:    string
  due_date: string
  due_time: string
  priority: Priority
  status:   TaskStatus
  phone:    string
  category: string
  notes:    string
}

const EMPTY_FORM: FormState = {
  type:     'reminder',
  title:    '',
  due_date: '',
  due_time: '',
  priority: 'medium',
  status:   'open',
  phone:    '',
  category: '',
  notes:    '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO()     { return new Date().toISOString().split('T')[0] }
function weekLaterISO() { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('he-IL') : '' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function RemindersClient() {
  const supabase  = useRef(createClient()).current
  const { showToast } = useToast()
  const { confirm }   = useConfirm()
  const tenantRef = useRef<string | null>(null)

  const [items, setItems]         = useState<ReminderItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [taskTab, setTaskTab]     = useState<TaskStatus>('open')
  const [filter, setFilter]       = useState<ReminderFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    if (!profile) { setLoading(false); return }
    tenantRef.current = profile.tenant_id
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
    setItems((data ?? []) as ReminderItem[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('reminders-client')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, supabase])

  // ── Derived lists ──────────────────────────────────────────────────────────

  const today     = todayISO()
  const weekLater = weekLaterISO()

  const reminders = items
    .filter(i => (i.type ?? 'reminder') === 'reminder' && !i.is_done)
    .filter(i => {
      if (filter === 'today')   return i.due_date === today
      if (filter === 'week')    return i.due_date && i.due_date >= today && i.due_date <= weekLater
      if (filter === 'overdue') return i.due_date && i.due_date < today
      return true
    })
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })

  const tasks = items
    .filter(i => (i.type ?? 'reminder') === 'task' && i.status === taskTab)
    .sort((a, b) => {
      const po: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
      return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
    })

  const doneCount = items.filter(i => (i.type ?? 'reminder') === 'reminder' && i.is_done).length

  const taskCounts: Record<TaskStatus, number> = {
    open:        items.filter(i => (i.type ?? 'reminder') === 'task' && i.status === 'open').length,
    in_progress: items.filter(i => (i.type ?? 'reminder') === 'task' && i.status === 'in_progress').length,
    closed:      items.filter(i => (i.type ?? 'reminder') === 'task' && i.status === 'closed').length,
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd(type: ItemType) {
    setEditId(null)
    setForm({ ...EMPTY_FORM, type })
    setModalOpen(true)
  }

  function openEdit(item: ReminderItem) {
    setEditId(item.id)
    setForm({
      type:     (item.type ?? 'reminder') as ItemType,
      title:    item.title,
      due_date: item.due_date  ?? '',
      due_time: item.due_time  ?? '',
      priority: item.priority  ?? 'medium',
      status:   item.status    ?? 'open',
      phone:    item.phone     ?? '',
      category: item.category  ?? '',
      notes:    item.notes     ?? '',
    })
    setModalOpen(true)
  }

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.title.trim()) { showToast('חובה להזין כותרת', 'error'); return }
    if (!tenantRef.current) return
    setSaving(true)

    const payload = {
      tenant_id: tenantRef.current,
      type:      form.type,
      title:     form.title.trim(),
      due_date:  form.due_date     || null,
      due_time:  form.due_time     || null,
      priority:  form.priority,
      status:    form.status,
      phone:     form.phone.trim()    || null,
      category:  form.category.trim() || null,
      notes:     form.notes.trim()    || null,
    }

    if (editId) {
      await supabase.from('reminders').update(payload).eq('id', editId)
      showToast('עודכן בהצלחה', 'success')
    } else {
      await supabase.from('reminders').insert({ ...payload, is_done: false })
      showToast('נוסף בהצלחה', 'success')
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function toggleDone(item: ReminderItem) {
    await supabase.from('reminders').update({ is_done: !item.is_done }).eq('id', item.id)
    load()
  }

  async function setTaskStatus(item: ReminderItem, status: TaskStatus) {
    await supabase.from('reminders').update({ status }).eq('id', item.id)
    load()
  }

  async function handleDelete(id: string, title: string) {
    const ok = await confirm({ msg: `למחוק "${title}"?` })
    if (!ok) return
    await supabase.from('reminders').delete().eq('id', id)
    showToast('נמחק', 'success')
    load()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginLeft: 'auto' }}>🔔 תזכורות ומשימות</h1>
        <Button variant="secondary" onClick={() => openAdd('task')}>+ משימה</Button>
        <Button onClick={() => openAdd('reminder')}>+ תזכורת</Button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>טוען...</div>
      ) : (
        /* Two-column layout */
        <div className="reminders-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0, alignItems: 'start' }}>

          {/* RIGHT – Reminders */}
          <div style={{ paddingLeft: 24 }}>
            <RemindersTab
              reminders={reminders}
              doneCount={doneCount}
              filter={filter}
              setFilter={setFilter}
              today={today}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={toggleDone}
            />
          </div>

          {/* Divider */}
          <div style={{ background: 'var(--border)', width: 1, alignSelf: 'stretch', minHeight: 300 }} />

          {/* LEFT – Tasks */}
          <div style={{ paddingRight: 24 }}>
            <TasksTab
              tasks={tasks}
              taskTab={taskTab}
              setTaskTab={setTaskTab}
              counts={taskCounts}
              onEdit={openEdit}
              onDelete={handleDelete}
              onStatusChange={setTaskStatus}
            />
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId
          ? (form.type === 'reminder' ? 'עריכת תזכורת' : 'עריכת משימה')
          : (form.type === 'reminder' ? 'תזכורת חדשה'  : 'משימה חדשה')}
        maxWidth={500}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>כותרת *</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={e => setF('title', e.target.value)}
              placeholder={form.type === 'reminder' ? 'לדוגמה: לפגוש את יוסי' : 'לדוגמה: להתקשר לספק'}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>עדיפות</label>
            <select style={inputStyle} value={form.priority} onChange={e => setF('priority', e.target.value as Priority)}>
              <option value="high">גבוהה</option>
              <option value="medium">בינונית</option>
              <option value="low">נמוכה</option>
            </select>
          </div>

          {form.type === 'reminder' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>תאריך יעד</label>
                <input type="date" style={inputStyle} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>שעה (אופציונלי)</label>
                <input type="time" style={inputStyle} value={form.due_time} onChange={e => setF('due_time', e.target.value)} />
              </div>
            </div>
          )}

          {form.type === 'task' && (
            <>
              <div>
                <label style={labelStyle}>טלפון לצור קשר (אופציונלי)</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={form.phone}
                  onChange={e => setF('phone', e.target.value)}
                  placeholder="050-1234567"
                  dir="ltr"
                />
              </div>
              <div>
                <label style={labelStyle}>סטטוס</label>
                <select style={inputStyle} value={form.status} onChange={e => setF('status', e.target.value as TaskStatus)}>
                  <option value="open">פתוח</option>
                  <option value="in_progress">בטיפול</option>
                  <option value="closed">נסגר</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>קטגוריה (אופציונלי)</label>
            <input
              style={inputStyle}
              value={form.category}
              onChange={e => setF('category', e.target.value)}
              placeholder="לדוגמה: ספק, לקוח, כלי רכב..."
            />
          </div>

          <div>
            <label style={labelStyle}>הערות</label>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              placeholder="הערות נוספות..."
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Reminders Tab ─────────────────────────────────────────────────────────────

function RemindersTab({
  reminders, doneCount, filter, setFilter, today, onEdit, onDelete, onToggle,
}: {
  reminders: ReminderItem[]
  doneCount: number
  filter:    ReminderFilter
  setFilter: (f: ReminderFilter) => void
  today:     string
  onEdit:    (i: ReminderItem) => void
  onDelete:  (id: string, title: string) => void
  onToggle:  (i: ReminderItem) => void
}) {
  const FILTERS: { key: ReminderFilter; label: string }[] = [
    { key: 'all',     label: 'הכל'       },
    { key: 'today',   label: 'היום'      },
    { key: 'week',    label: 'שבוע הבא'  },
    { key: 'overdue', label: '⚠️ באיחור' },
  ]

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>🔔</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>תזכורות</h2>
        {reminders.length > 0 && (
          <span style={badgeStyle('var(--warning)')}>{reminders.length}</span>
        )}
        {doneCount > 0 && (
          <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{doneCount} טופלו</span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '4px 12px', borderRadius: 20,
            border: '1px solid var(--border)',
            background: filter === f.key ? 'var(--primary)' : '#fff',
            color:      filter === f.key ? '#fff' : 'var(--text)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
            fontWeight: filter === f.key ? 600 : 400,
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {reminders.length === 0 ? (
        <EmptyState icon="🔔" text="אין תזכורות פתוחות" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reminders.map(r => {
            const isOverdue = r.due_date && r.due_date < today
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 10, padding: '11px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                boxShadow: 'var(--shadow)',
                borderRight: `3px solid ${PRIORITY_COLOR[r.priority ?? 'medium']}`,
              }}>
                <input
                  type="checkbox" checked={r.is_done} onChange={() => onToggle(r)}
                  style={{ marginTop: 3, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{r.title}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.due_date && (
                      <span style={{
                        fontSize: 11,
                        color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
                        fontWeight: isOverdue ? 600 : 400,
                      }}>
                        {isOverdue ? '⚠️ ' : '📅 '}{fmtDate(r.due_date)}{r.due_time ? ` ${r.due_time}` : ''}
                      </span>
                    )}
                    {r.category && <span style={tagStyle('var(--accent)', '#fff')}>{r.category}</span>}
                    <span style={tagStyle(PRIORITY_COLOR[r.priority ?? 'medium'], '#fff')}>
                      {PRIORITY_LABEL[r.priority ?? 'medium']}
                    </span>
                  </div>
                  {r.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{r.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <ActionBtn onClick={() => onEdit(r)} title="עריכה">✏️</ActionBtn>
                  <ActionBtn onClick={() => onDelete(r.id, r.title)} title="מחיקה">🗑️</ActionBtn>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tasks Tab ─────────────────────────────────────────────────────────────────

function TasksTab({
  tasks, taskTab, setTaskTab, counts, onEdit, onDelete, onStatusChange,
}: {
  tasks:          ReminderItem[]
  taskTab:        TaskStatus
  setTaskTab:     (s: TaskStatus) => void
  counts:         Record<TaskStatus, number>
  onEdit:         (i: ReminderItem) => void
  onDelete:       (id: string, title: string) => void
  onStatusChange: (i: ReminderItem, s: TaskStatus) => void
}) {
  const STATUSES: TaskStatus[] = ['open', 'in_progress', 'closed']

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>משימות</h2>
        {(counts.open + counts.in_progress) > 0 && (
          <span style={badgeStyle('var(--primary)')}>{counts.open + counts.in_progress}</span>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setTaskTab(s)} style={{
            padding: '4px 12px', borderRadius: 20,
            border:   `1px solid ${taskTab === s ? TASK_STATUS_COLOR[s] : 'var(--border)'}`,
            background: taskTab === s ? TASK_STATUS_COLOR[s] : '#fff',
            color:      taskTab === s ? '#fff' : 'var(--text)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
            fontWeight: taskTab === s ? 700 : 400,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {TASK_STATUS_LABEL[s]}
            {counts[s] > 0 && (
              <span style={{
                background: taskTab === s ? 'rgba(255,255,255,0.3)' : 'var(--border)',
                borderRadius: 99, fontSize: 10, padding: '1px 5px', fontWeight: 700,
              }}>{counts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon="✅" text={`אין משימות ב${TASK_STATUS_LABEL[taskTab]}`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => (
            <div key={t.id} style={{
              background: '#fff', borderRadius: 10, padding: '11px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              boxShadow: 'var(--shadow)',
              borderRight: `3px solid ${PRIORITY_COLOR[t.priority ?? 'medium']}`,
              opacity: t.status === 'closed' ? 0.7 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, marginBottom: 3,
                  textDecoration: t.status === 'closed' ? 'line-through' : 'none',
                  color: t.status === 'closed' ? 'var(--text-muted)' : 'var(--text)',
                }}>
                  {t.title}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {t.phone && (
                    <a href={`tel:${t.phone}`} style={{
                      fontSize: 11, color: 'var(--accent)', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}>📞 {t.phone}</a>
                  )}
                  {t.category && <span style={tagStyle('var(--accent)', '#fff')}>{t.category}</span>}
                  <span style={tagStyle(PRIORITY_COLOR[t.priority ?? 'medium'], '#fff')}>
                    {PRIORITY_LABEL[t.priority ?? 'medium']}
                  </span>
                </div>
                {t.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{t.notes}</div>}

                <div style={{ marginTop: 7, display: 'flex', gap: 5 }}>
                  {t.status === 'open' && (
                    <button style={moveBtnStyle('var(--warning)')} onClick={() => onStatusChange(t, 'in_progress')}>→ בטיפול</button>
                  )}
                  {t.status === 'in_progress' && (
                    <>
                      <button style={moveBtnStyle('#64748b')}       onClick={() => onStatusChange(t, 'open')}>← פתוח</button>
                      <button style={moveBtnStyle('var(--primary)')} onClick={() => onStatusChange(t, 'closed')}>✓ סגור</button>
                    </>
                  )}
                  {t.status === 'closed' && (
                    <button style={moveBtnStyle('#64748b')} onClick={() => onStatusChange(t, 'open')}>↩ פתח מחדש</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <ActionBtn onClick={() => onEdit(t)} title="עריכה">✏️</ActionBtn>
                <ActionBtn onClick={() => onDelete(t.id, t.title)} title="מחיקה">🗑️</ActionBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      {text}
    </div>
  )
}

function ActionBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: 14, padding: '4px 5px', borderRadius: 6, color: 'var(--text-muted)',
    }}>
      {children}
    </button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', background: '#fff',
}

function tagStyle(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99 }
}

function moveBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '2px 9px', fontSize: 11, fontFamily: 'inherit',
    border: `1px solid ${color}`, borderRadius: 6,
    background: 'transparent', color, cursor: 'pointer', fontWeight: 600,
  }
}

function badgeStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff',
    borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 7px',
  }
}
