'use client'

import { useCallback, useEffect, useState } from 'react'
import { startLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import type { YardSession } from '@/lib/yard/types'
import { sessionTotal, minutesSince, formatPlate, CLOSE_TYPE_LABEL } from '@/lib/yard/types'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import SessionItemsEditor from '@/components/yard/SessionItemsEditor'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import RequestsPanel from '@/components/yard-hub/RequestsPanel'
import LoansPanel from '@/components/yard-hub/LoansPanel'

const OPEN_KEY = 'yard-drawer-open'
const TAB_KEY  = 'yard-drawer-tab'
type DrawerTab = 'yard' | 'requests' | 'loans'
const POLL_OPEN_MS   = 45_000    // drawer open: cards + counts
const POLL_CLOSED_MS = 180_000   // closed: only the badge counts on the rail

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
  const [copied, setCopied]     = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [closed, setClosed]     = useState<YardSession[]>([])
  const [closedDays, setClosedDays] = useState(3)
  // Yard tracking (waiting customers, loans) lives here too — tabs; counts feed the tabs and the closed rail
  const [tab, setTab] = useState<DrawerTab>(() => { try { const t = localStorage.getItem(TAB_KEY); return t === 'requests' || t === 'loans' ? t : 'yard' } catch { return 'yard' } })
  const [counts, setCounts] = useState<Record<string, number>>({})
  const { confirm } = useConfirm()

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch('/api/yard/sessions?status=pending_office'),
        fetch('/api/yard/sessions?status=active'),
      ])
      const pending: YardSession[] = a.ok ? await a.json() : []
      const active: YardSession[]  = p.ok ? await p.json() : []
      setCards([...pending, ...active])
      const c = await fetch('/api/yard/counts')
      if (c.ok) setCounts(await c.json())
    } catch { /* network hiccup — keep the last list */ }
  }, [])

  const loadClosed = useCallback(async (days: number) => {
    try {
      const r = await fetch(`/api/yard/sessions?status=archived&days=${days}`)
      if (r.ok) setClosed(await r.json())
    } catch { /* keep the last list */ }
  }, [])

  useEffect(() => {
    if (!showClosed) return
    const t = setTimeout(() => loadClosed(closedDays), 0)
    return () => clearTimeout(t)
  }, [showClosed, closedDays, loadClosed])

  async function copyPlate(id: string, plate: string) {
    try { await navigator.clipboard.writeText(plate) } catch { return }
    setCopied(id)
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1500)
  }

  async function reopen(id: string) {
    setBusy(id)
    await fetch(`/api/yard/sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'pending_office' }),
    })
    setBusy(null)
    await Promise.all([load(), loadClosed(closedDays)])
  }

  // Mounted on every admin page in every tab — so: no polling in hidden/unfocused windows
  // (startLiveRefresh), and while closed only the counts (one call instead of three).
  const loadCounts = useCallback(async () => {
    try { const c = await fetch('/api/yard/counts'); if (c.ok) setCounts(await c.json()) } catch { /* keep last */ }
  }, [])
  useEffect(() => {
    const tick = open ? load : loadCounts
    const first = setTimeout(tick, 0)
    const stop = startLiveRefresh(tick, open ? POLL_OPEN_MS : POLL_CLOSED_MS)
    return () => { clearTimeout(first); stop() }
  }, [load, loadCounts, open])

  // Push the page: main's left margin follows the drawer width
  useEffect(() => {
    document.documentElement.style.setProperty('--drawer-w', open ? 'clamp(340px, 33vw, 480px)' : '52px')
    return () => { document.documentElement.style.removeProperty('--drawer-w') }
  }, [open])

  function pickTab(t: DrawerTab) {
    setTab(t)
    try { localStorage.setItem(TAB_KEY, t) } catch {}
  }

  function toggle(next: boolean) {
    setOpen(next)
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0') } catch {}
  }

  async function setStatus(id: string, status: 'archived' | 'active', closeType?: 'charged' | 'free' | 'cancelled') {
    setBusy(id)
    const r = await fetch(`/api/yard/sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, close_type: closeType }),
    })
    if (!r.ok) alert((await r.json().catch(() => null))?.error ?? 'הפעולה נכשלה')
    setBusy(null); setEditing(null)
    load()
    if (showClosed) loadClosed(closedDays)
  }

  const waiting = cards.filter(c => c.status === 'pending_office').length

  async function closeFree(s: YardSession) {
    if (!await confirm({ msg: `לסגור את ${formatPlate(s.plate)} ללא חיוב? המלאי יירד, אבל הכרטיס לא ייספר כהכנסה.`, icon: '🎁', confirmLabel: 'סגור ללא חיוב', variant: 'primary' })) return
    setStatus(s.id, 'archived', 'free')
  }
  async function cancelCard(s: YardSession) {
    if (!await confirm({ msg: `לבטל את הכרטיס של ${formatPlate(s.plate)}? הוא ייסגר בלי חיוב ובלי להוריד מלאי.`, icon: '✕', confirmLabel: 'בטל כרטיס', variant: 'danger' })) return
    setStatus(s.id, 'archived', 'cancelled')
  }

  if (!open) {
    return (
      <aside className="yard-drawer yard-drawer-closed" aria-label="בקרת רחבה">
        <button type="button" onClick={() => toggle(true)} className={cards.length ? '' : 'empty'}
          aria-label={cards.length ? `פתח בקרת רחבה — ${cards.length} רכבים${waiting ? `, ${waiting} לסגירה` : ''}` : 'פתח בקרת רחבה — אין רכבים'}>
          <CarIcon size={22} />
          {cards.length > 0 && <span className="yd-vt">רחבה</span>}
          {cards.length > 0 && <span className="yd-n num">{cards.length}</span>}
          {waiting > 0 && <span className="yd-alert">{waiting} לסגירה</span>}
          {(counts.yard_requests ?? 0) > 0 && <>
            <span className="yd-sep" />
            <span className="yd-vt">ממתינים</span>
            <span className="yd-n num warn">{counts.yard_requests}</span>
            {(counts.yard_requests_arrived ?? 0) > 0 && <span className="yd-alert ok">{counts.yard_requests_arrived} הגיע</span>}
          </>}
          {(counts.yard_loans ?? 0) > 0 && <>
            <span className="yd-sep" />
            <span className="yd-vt">השאלות</span>
            <span className={`yd-n num${(counts.yard_loans_stale ?? 0) > 0 ? ' dan' : ''}`}>{counts.yard_loans}</span>
          </>}
        </button>
      </aside>
    )
  }

  return (
    <aside className="yard-drawer yard-theme" aria-label="בקרת רחבה">
      <div className="yd-head">
        <CarIcon size={18} />
        <h2>בקרת רחבה</h2>
        <button type="button" onClick={() => toggle(false)} aria-label="סגור את בקרת הרחבה" className="yd-x">✕</button>
      </div>

      <div className="yd-tabs" role="tablist">
        {([
          { key: 'yard', label: 'רכבים ברחבה', n: cards.length, tone: '' },
          { key: 'requests', label: 'ממתינים', n: counts.yard_requests ?? 0, tone: (counts.yard_requests_arrived ?? 0) > 0 ? 'ok' : 'warn' },
          { key: 'loans', label: 'השאלות', n: counts.yard_loans ?? 0, tone: (counts.yard_loans_stale ?? 0) > 0 ? 'dan' : '' },
        ] as const).map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => pickTab(t.key)}>
            {t.label}{t.n > 0 && <span className={`yd-tn ${t.tone}`}>{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'requests' && <RequestsPanel variant="drawer" />}
      {tab === 'loans' && <LoansPanel variant="drawer" />}

      {tab === 'yard' && <div className="yd-body">
        {cards.length === 0 && (
          <div className="yd-empty"><CarIcon size={34} /><b>אין רכבים ברחבה</b><span>כשרכב ייקלט ברחבה הוא יופיע כאן.</span></div>
        )}
        {cards.map(s => {
          const isWaiting = s.status === 'pending_office'
          const items = s.yard_session_items ?? []
          return (
            <article key={s.id} className={`yd-card${isWaiting ? ' wait' : ''}`} style={{ opacity: busy === s.id ? 0.55 : 1 }}>
              <div className="yd-card-h">
                <PlateCopy plate={s.plate} copied={copied === s.id} onCopy={() => copyPlate(s.id, s.plate)} />
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
                {/* Office can close any card — also one still in work (car left, nothing done) */}
                <button type="button" className="yd-close" disabled={busy !== null} onClick={() => setStatus(s.id, 'archived', 'charged')}>
                  {busy === s.id ? '...' : '✓ סגור כרטיס'}
                </button>
                <RowActionsMenu align="end" actions={[
                  { key: 'edit', label: editingId === s.id ? 'סיום עריכה' : 'עריכת נתונים', icon: '✏️', onClick: () => setEditing(id => id === s.id ? null : s.id) },
                  { key: 'free', label: 'סגירה ללא חיוב', icon: '🎁', onClick: () => closeFree(s) },
                  { key: 'cancel', label: 'ביטול כרטיס (בלי להוריד מלאי)', icon: '✕', danger: true, onClick: () => cancelCard(s) },
                  ...(isWaiting ? [{ key: 'back', label: 'החזרה לרחבה', icon: '🔄', onClick: () => setStatus(s.id, 'active') }] : []),
                ]} />
              </div>
            </article>
          )
        })}

        {/* Closed cards — view and reopen (stock deducted on close is returned) */}
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <button type="button" onClick={() => setShowClosed(v => !v)}
            style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--text)', padding: 0 }}>
            {showClosed ? '▾' : '▸'} כרטיסים שנסגרו
          </button>
          {showClosed && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                הצג מ-
                <select value={closedDays} onChange={e => setClosedDays(Number(e.target.value))} aria-label="טווח ימים" className="form-input" style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                  <option value={1}>היום</option>
                  <option value={3}>3 ימים</option>
                  <option value={7}>שבוע</option>
                  <option value={30}>חודש</option>
                </select>
              </label>
              {closed.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין כרטיסים סגורים בטווח הזה</div>}
              {closed.map(s => {
                const items = s.yard_session_items ?? []
                return (
                  <article key={s.id} className="yd-card" style={{ opacity: busy === s.id ? 0.55 : 0.9 }}>
                    <div className="yd-card-h">
                      <PlateCopy plate={s.plate} copied={copied === s.id} onCopy={() => copyPlate(s.id, s.plate)} />
                      <b>{[s.make, s.model].filter(Boolean).join(' ') || 'רכב'}</b>
                      <span className="num" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {s.closed_at ? new Date(s.closed_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      <span className="yd-st" style={s.close_type === 'cancelled' ? { background: '#fee2e2', color: '#b91c1c' } : s.close_type === 'free' ? { background: '#ede9fe', color: '#6d28d9' } : undefined}>
                        {CLOSE_TYPE_LABEL[s.close_type ?? 'charged']}
                      </span>
                    </div>
                    <ul className="yd-items">
                      {items.map(it => (
                        <li key={it.id}><span className="nm">{it.name}</span><span className="num">{it.quantity} × {it.unit_price.toLocaleString()}₪</span></li>
                      ))}
                    </ul>
                    <div className="yd-card-f">
                      <span className="num yd-total">{sessionTotal(items).toLocaleString()}₪</span>
                      <span style={{ marginInlineStart: 'auto' }} />
                      <button type="button" className="yd-close" disabled={busy !== null} onClick={() => reopen(s.id)}>
                        {busy === s.id ? '...' : '↩ פתח מחדש'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>}
    </aside>
  )
}

function PlateCopy({ plate, copied, onCopy }: { plate: string; copied: boolean; onCopy: () => void }) {
  return (
    <button type="button" className="plate-chip" onClick={onCopy} title="לחץ להעתקה" aria-label={`העתק מספר רכב ${formatPlate(plate)}`}
      style={{ cursor: 'pointer', border: 0, font: 'inherit', ...(copied ? { background: '#16a34a', color: '#fff' } : {}) }}>
      {copied ? '✓ הועתק' : formatPlate(plate)}
    </button>
  )
}

function CarIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13l2-5a2 2 0 0 1 2-1.3h10a2 2 0 0 1 2 1.3l2 5v5h-3v-2H6v2H3z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" />
    </svg>
  )
}
