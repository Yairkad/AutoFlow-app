'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

interface Item {
  id:       string
  type:     string | null
  title:    string
  due_date: string | null
  priority: string
  status:   string | null
  phone:    string | null
  is_done:  boolean
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   'var(--danger)',
  medium: 'var(--warning)',
  low:    'var(--primary)',
}

export default function RemindersPanel({ compact }: { compact?: boolean } = {}) {
  const isMobile = useIsMobile()
  const [reminders, setReminders] = useState<Item[]>([])
  const [tasks, setTasks]         = useState<Item[]>([])
  const [loading, setLoading]     = useState(true)
  const [popupOpen, setPopupOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const fetch = async () => {
      const { data } = await supabase
        .from('reminders')
        .select('id,type,title,due_date,priority,status,phone,is_done')
        .order('due_date', { ascending: true })
        .limit(50)
      const all = (data ?? []) as Item[]
      const today = new Date().toISOString().split('T')[0]

      setReminders(
        all
          .filter(i => (i.type ?? 'reminder') === 'reminder' && !i.is_done)
          .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return a.due_date.localeCompare(b.due_date)
          })
          .slice(0, 5)
      )
      setTasks(
        all
          .filter(i => (i.type ?? 'reminder') === 'task' && i.status !== 'closed')
          .sort((a, b) => {
            const po: Record<string, number> = { high: 0, medium: 1, low: 2 }
            return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
          })
          .slice(0, 4)
      )
      setLoading(false)
    }

    fetch()

    const channel = supabase
      .channel('reminders-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, fetch)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const total = reminders.length + tasks.length

  // Mobile / compact: expandable popup (same pattern as AlertsPanel)
  if (isMobile || compact) {
    return (
      <>
        <button
          onClick={() => setPopupOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 14px', flex: compact ? 1 : undefined,
            background: '#fff', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', borderTop: '3px solid var(--warning)',
            fontSize: '14px', fontWeight: 600, color: 'var(--text)',
            border: 'none', cursor: 'pointer', textAlign: 'right',
          }}
        >
          <span>🔔</span>
          <span>תזכורות</span>
          {!loading && total > 0 && (
            <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '999px', fontSize: '12px', fontWeight: 700, padding: '2px 9px', lineHeight: 1.4 }}>{total}</span>
          )}
          {!loading && total === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 400 }}>✓ הכל מטופל</span>
          )}
          <span style={{ marginRight: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{popupOpen ? '▲' : '▼'}</span>
        </button>

        {popupOpen && (
          <>
            <div onClick={() => setPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
            <div style={{
              position: 'fixed', bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
              right: 12, left: 12, zIndex: 200,
              background: '#fff', borderRadius: '14px',
              boxShadow: '0 -4px 32px rgba(0,0,0,.18)',
              border: '1px solid var(--border)',
              padding: '16px', maxHeight: '60vh', overflowY: 'auto',
              direction: 'rtl',
            }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                🔔 תזכורות ומשימות
                <button onClick={() => setPopupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
              </div>
              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>טוען...</div>
              ) : total === 0 ? (
                <div style={{ color: 'var(--primary)', fontSize: '13px' }}>✓ אין תזכורות פעילות</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {reminders.map(r => {
                    const isOverdue = r.due_date && r.due_date < today
                    return (
                      <div key={r.id} style={{ background: isOverdue ? '#fef2f2' : 'var(--bg)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                        <div style={{ fontWeight: 600, color: isOverdue ? 'var(--danger)' : 'var(--text)' }}>{r.title}</div>
                        {r.due_date && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{isOverdue ? '⚠️ ' : '📅 '}{r.due_date}</div>}
                      </div>
                    )
                  })}
                  {tasks.map(t => (
                    <div key={t.id} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', borderRight: `3px solid ${PRIORITY_COLOR[t.priority] ?? 'var(--border)'}` }}>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>משימה · {t.priority === 'high' ? '🔴 דחוף' : t.priority === 'medium' ? '🟡 בינוני' : '🟢 נמוך'}</div>
                    </div>
                  ))}
                </div>
              )}
              <a href="/reminders" style={{ display: 'block', textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                → כל התזכורות
              </a>
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      borderTop: '3px solid var(--warning)',
      padding: '16px',
      width: '240px',
      flexShrink: 0,
      height: '100%',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontSize: '18px' }}>🔔</span>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>תזכורות ומשימות</h3>
        {total > 0 && (
          <span style={{
            marginRight: 'auto',
            background: 'var(--danger)', color: '#fff',
            borderRadius: '999px', fontSize: '11px', fontWeight: 700, padding: '1px 7px',
          }}>{total}</span>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>טוען...</div>
      ) : total === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
          הכל מטופל 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

          {/* Reminders */}
          {reminders.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>תזכורות</div>
              {reminders.map(r => {
                const isOverdue = r.due_date && r.due_date < today
                return (
                  <div key={r.id} style={{
                    padding: '9px 11px', borderRadius: '8px', background: 'var(--bg)',
                    borderRight: `3px solid ${PRIORITY_COLOR[r.priority] ?? 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{r.title}</div>
                    {r.due_date && (
                      <div style={{
                        fontSize: '11px',
                        color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
                        fontWeight: isOverdue ? 600 : 400,
                      }}>
                        {isOverdue ? '⚠️ ' : '📅 '}
                        {new Date(r.due_date).toLocaleDateString('he-IL')}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 6, marginBottom: 2 }}>משימות</div>
              {tasks.map(t => (
                <div key={t.id} style={{
                  padding: '9px 11px', borderRadius: '8px', background: 'var(--bg)',
                  borderRight: `3px solid ${PRIORITY_COLOR[t.priority] ?? 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {t.phone && (
                      <a href={`tel:${t.phone}`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                        📞 {t.phone}
                      </a>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                      background: t.status === 'in_progress' ? 'var(--warning)' : 'var(--border)',
                      color: t.status === 'in_progress' ? '#fff' : 'var(--text-muted)',
                    }}>
                      {t.status === 'in_progress' ? 'בטיפול' : 'פתוח'}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          <a
            href="/reminders"
            style={{
              display: 'block', textAlign: 'center', fontSize: 12,
              color: 'var(--primary)', marginTop: 6, textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            לכל התזכורות ←
          </a>
        </div>
      )}
    </div>
  )
}
