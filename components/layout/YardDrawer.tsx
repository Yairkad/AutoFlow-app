'use client'

import { useCallback, useEffect, useState } from 'react'
import type { YardSession } from '@/lib/yard/types'
import { sessionTotal, minutesSince, formatPlate } from '@/lib/yard/types'
import SessionItemsEditor from '@/components/yard/SessionItemsEditor'
import RowActionsMenu from '@/components/ui/RowActionsMenu'

const OPEN_KEY = 'yard-drawer-open'
const POLL_MS  = 20_000

// Yard control on every desktop screen (redesign): a thin tab on the left edge; opened, it takes the
// left third and pushes the page narrower (AppShell's main uses --drawer-w) instead of covering it.
// Cards are edited in place (price / qty / add / remove) and closed from here — no trip to the yard
// terminal or the office screen. Hidden on mobile (globals.css).
export default function YardDrawer() {
  // Rendered only on the client (after the profile loads), so reading storage here is safe
  const [open, setOpen]         = useState(() => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } })
  const [cards, setCards]       = useState<YardSession[]>([])
  const [editingId, setEditing] = useState<string | null>(null)
  const [busy, setBusy]         = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch('/api/yard/sessions?status=pending_office'),
        fetch('/api/yard/sessions?status=active'),
      ])
      const pending: YardSession[] = a.ok ? await a.json() : []
      const active: YardSession[]  = p.ok ? await p.json() : []
      setCards([...pending, ...active])
    } catch { /* network hiccup — keep the last list */ }
  }, [])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const id = setInterval(load, POLL_MS)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [load])

  // Push the page: main's left margin follows the drawer width
  useEffect(() => {
    document.documentElement.style.setProperty('--drawer-w', open ? 'clamp(340px, 33vw, 480px)' : '52px')
    return () => { document.documentElement.style.removeProperty('--drawer-w') }
  }, [open])

  function toggle(next: boolean) {
    setOpen(next)
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0') } catch {}
  }

  async function setStatus(id: string, status: 'archived' | 'active') {
    setBusy(id)
    await fetch(`/api/yard/sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    setBusy(null); setEditing(null)
    load()
  }

  const waiting = cards.filter(c => c.status === 'pending_office').length

  if (!open) {
    return (
      <aside className="yard-drawer yard-drawer-closed" aria-label="בקרת רחבה">
        <button type="button" onClick={() => toggle(true)} className={cards.length ? '' : 'empty'}
          aria-label={cards.length ? `פתח בקרת רחבה — ${cards.length} רכבים${waiting ? `, ${waiting} לסגירה` : ''}` : 'פתח בקרת רחבה — אין רכבים'}>
          <CarIcon size={22} />
          {cards.length > 0 && <span className="yd-vt">רחבה</span>}
          {cards.length > 0 && <span className="yd-n num">{cards.length}</span>}
          {waiting > 0 && <span className="yd-alert">{waiting} לסגירה</span>}
        </button>
      </aside>
    )
  }

  return (
    <aside className="yard-drawer yard-theme" aria-label="בקרת רחבה">
      <div className="yd-head">
        <CarIcon size={18} />
        <h2>בקרת רחבה</h2>
        <span className="yd-pill">{cards.length} רכבים</span>
        <button type="button" onClick={() => toggle(false)} aria-label="סגור את בקרת הרחבה" className="yd-x">✕</button>
      </div>

      <div className="yd-body">
        {cards.length === 0 && (
          <div className="yd-empty"><CarIcon size={34} /><b>אין רכבים ברחבה</b><span>כשרכב ייקלט ברחבה הוא יופיע כאן.</span></div>
        )}
        {cards.map(s => {
          const isWaiting = s.status === 'pending_office'
          const items = s.yard_session_items ?? []
          return (
            <article key={s.id} className={`yd-card${isWaiting ? ' wait' : ''}`} style={{ opacity: busy === s.id ? 0.55 : 1 }}>
              <div className="yd-card-h">
                <span className="plate-chip">{formatPlate(s.plate)}</span>
                <b>{[s.make, s.model].filter(Boolean).join(' ') || 'רכב'}</b>
                <span className="num" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{minutesSince(s.opened_at)} דק׳</span>
                <span className={`yd-st ${isWaiting ? 'wait' : ''}`}>{isWaiting ? 'ממתין לסגירה' : 'בעבודה'}</span>
              </div>

              {editingId === s.id ? (
                <SessionItemsEditor session={s} onChanged={load} onDone={() => setEditing(null)} />
              ) : (
                <ul className="yd-items">
                  {items.map(it => (
                    <li key={it.id}>
                      <span className="nm">{it.name}</span>
                      <span className="num">{it.quantity} × {it.unit_price.toLocaleString()}₪</span>
                    </li>
                  ))}
                  {items.length === 0 && <li style={{ color: 'var(--text-muted)' }}>אין עדיין פריטים</li>}
                </ul>
              )}

              <div className="yd-card-f">
                <span className="num yd-total">{sessionTotal(items).toLocaleString()}₪</span>
                <span style={{ marginInlineStart: 'auto' }} />
                {isWaiting && (
                  <button type="button" className="yd-close" disabled={busy !== null} onClick={() => setStatus(s.id, 'archived')}>
                    {busy === s.id ? '...' : '✓ סגור כרטיס'}
                  </button>
                )}
                <RowActionsMenu align="end" actions={[
                  { key: 'edit', label: editingId === s.id ? 'סיום עריכה' : 'עריכת נתונים', icon: '✏️', onClick: () => setEditing(id => id === s.id ? null : s.id) },
                  ...(isWaiting ? [{ key: 'back', label: 'החזרה לרחבה', icon: '🔄', onClick: () => setStatus(s.id, 'active') }] : []),
                ]} />
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}

function CarIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13l2-5a2 2 0 0 1 2-1.3h10a2 2 0 0 1 2 1.3l2 5v5h-3v-2H6v2H3z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" />
    </svg>
  )
}
