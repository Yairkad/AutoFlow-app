'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { runGlobalSearch, FIELD_LABELS, KIND_LABELS, type SearchField, type SearchKind, type SearchResult } from '@/lib/search/globalSearch'
import { useProfile } from '@/lib/contexts/ProfileContext'

// ── Hebrew numeral conversion ──────────────────────────────────────────────

const HEB_ONES     = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const HEB_TENS     = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const HEB_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']

function toHebrewLetters(n: number, isYear = false): string {
  if (isYear && n >= 1000) n = n % 1000
  const h   = Math.floor(n / 100)
  const rem = n % 100
  let result = HEB_HUNDREDS[h] ?? ''
  if (rem === 15) result += 'טו'
  else if (rem === 16) result += 'טז'
  else {
    result += HEB_TENS[Math.floor(rem / 10)] ?? ''
    result += HEB_ONES[rem % 10] ?? ''
  }
  return result
}

// ── Clock ──────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── Search types ───────────────────────────────────────────────────────────


// ── UserDropdown ───────────────────────────────────────────────────────────

function ChangePasswordModal({ onClose, userEmail }: { onClose: () => void; userEmail: string }) {
  const supabase = useRef(createClient()).current
  const [oldPass,  setOldPass]  = useState('')
  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  async function save() {
    if (!oldPass)            { setError('נא להזין סיסמא נוכחית'); return }
    if (newPass.length < 6)  { setError('מינימום 6 תווים'); return }
    if (newPass !== confirm)  { setError('הסיסמאות אינן תואמות'); return }
    setSaving(true); setError('')
    // Verify current password
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: oldPass })
    if (verifyErr) { setError('הסיסמא הנוכחית שגויה'); setSaving(false); return }
    const { error: err } = await supabase.auth.updateUser({ password: newPass })
    setSaving(false)
    if (err) setError(err.message)
    else setSuccess(true)
  }

  const inSt: React.CSSProperties = {
    padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', background: 'var(--bg)', width: '100%', boxSizing: 'border-box', direction: 'ltr',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 299 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--bg-card)', borderRadius: '14px', padding: '28px',
        width: 'min(340px, calc(100vw - 32px))', zIndex: 300, direction: 'rtl', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '20px' }}>שינוי סיסמא</div>
        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: 600 }}>הסיסמא עודכנה בהצלחה</div>
            <button onClick={onClose} style={{ marginTop: '16px', padding: '8px 24px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>סגור</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>סיסמא נוכחית</label>
              <input type="password" style={inSt} value={oldPass} onChange={e => setOldPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" readOnly onFocus={e => e.currentTarget.removeAttribute('readonly')} data-lpignore="true" data-1p-ignore="true" />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>סיסמא חדשה</label>
              <input type="password" style={inSt} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="מינימום 6 תווים" autoComplete="new-password" readOnly onFocus={e => e.currentTarget.removeAttribute('readonly')} data-lpignore="true" data-1p-ignore="true" />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>אמת סיסמא</label>
              <input type="password" style={inSt} value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder="הכנס שוב" autoComplete="new-password" readOnly onFocus={e => e.currentTarget.removeAttribute('readonly')} data-lpignore="true" data-1p-ignore="true" />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function UserDropdown({ name, email, onClose }: { name: string; email: string; onClose: () => void }) {
  const router   = useRouter()
  const supabase = useRef(createClient()).current
  const [showChangePw, setShowChangePw] = useState(false)

  async function logout() {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
    localStorage.clear()
    sessionStorage.clear()
    router.push('/login')
  }

  const btnStyle: React.CSSProperties = {
    width: '100%', textAlign: 'right', padding: '11px 16px', border: 'none',
    background: 'transparent', cursor: 'pointer', fontSize: '13px',
    display: 'flex', alignItems: 'center', gap: '8px',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 8px)', left: 0,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,.15)',
        minWidth: '220px', zIndex: 200, overflow: 'hidden', direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>{name || 'משתמש'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{email}</div>
        </div>
        <button onClick={() => setShowChangePw(true)} style={btnStyle}>
          <span>🔑</span> שינוי סיסמא
        </button>
        <button onClick={logout} style={{ ...btnStyle, color: 'var(--danger)', borderTop: '1px solid var(--border)' }}>
          <span>🚪</span> התנתקות
        </button>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => { setShowChangePw(false); onClose() }} userEmail={email} />}
    </>
  )
}

// ── Search filter: small button at the edge of the search box + popover menu ─

function SearchFilter({ field, kind, onField, onKind }: {
  field: SearchField; kind: SearchKind; onField: (f: SearchField) => void; onKind: (k: SearchKind) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const active = field !== 'all' || kind !== 'all'
  const keep = (e: React.MouseEvent) => e.preventDefault() // keep focus in the search input
  const pill = (label: string, clear: () => void) => (
    <button type="button" onMouseDown={keep} onClick={clear} title="בטל סינון" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: 11.5, fontWeight: 700,
      borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label} <span aria-hidden>✕</span></button>
  )
  const item = (label: string, on: boolean, pick: () => void) => (
    <button key={label} type="button" onMouseDown={keep} onClick={() => { pick(); setOpen(false) }} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 13, textAlign: 'right', padding: '6px 10px', borderRadius: 6,
      background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text)', fontWeight: on ? 700 : 400,
    }}>{label}{on && <span>✓</span>}</button>
  )
  const head = (t: string) => <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 10px 3px' }}>{t}</div>

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {field !== 'all' && pill(FIELD_LABELS[field], () => onField('all'))}
      {kind !== 'all' && pill(KIND_LABELS[kind], () => onKind('all'))}
      <button type="button" onMouseDown={keep} onClick={() => setOpen(v => !v)} aria-label="סינון חיפוש" aria-expanded={open} title="סינון חיפוש" style={{
        width: 28, height: 28, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active || open ? 'var(--primary)' : 'var(--border)'}`,
        background: active || open ? 'var(--primary)' : 'var(--bg-card)', color: active || open ? '#fff' : 'var(--text-muted)',
      }}>
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>
      </button>
      {open && (
        <div onMouseDown={keep} style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 220, zIndex: 600, direction: 'rtl',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: 6, maxHeight: '70vh', overflowY: 'auto',
        }}>
          {head('חפש לפי')}
          {(Object.keys(FIELD_LABELS) as SearchField[]).map(f => item(FIELD_LABELS[f], field === f, () => onField(f)))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {head('הצג רק')}
          {(Object.keys(KIND_LABELS) as SearchKind[]).map(k => item(KIND_LABELS[k], kind === k, () => onKind(k)))}
        </div>
      )}
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const now      = useClock()
  const router   = useRouter()
  const supabase = useRef(createClient()).current
  const { profile } = useProfile()

  const userName     = profile?.fullName ?? ''
  const userEmail    = profile?.email ?? ''
  const tenantName   = (profile?.tenant?.name as string | undefined) ?? null
  const tenantLogo   = (profile?.tenant?.logo_base64 as string | undefined) ?? null
  const [showDropdown, setShowDropdown] = useState(false)

  // Notification bell
  const [pendingTestTransfer, setPendingTestTransfer] = useState(0)
  const [showBell,            setShowBell]            = useState(false)

  // Mobile search overlay
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // Search state
  const [q,        setQ]        = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [loading,  setLoading]  = useState(false)
  const [focused,  setFocused]  = useState(false)
  const [selected, setSelected] = useState(0)
  const [field,    setField]    = useState<SearchField>('all')
  const [kind,     setKind]     = useState<SearchKind>('all')
  const searchSeq   = useRef(0)
  // Width of the filter button (+ active-filter pills) sitting inside the left edge of the input
  const filterBoxRef = useRef<HTMLDivElement>(null)
  const [filterW, setFilterW] = useState(40)
  useLayoutEffect(() => { setFilterW((filterBoxRef.current?.offsetWidth ?? 28) + 12) }, [field, kind])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef   = useRef<HTMLDivElement>(null)

  // Pending counts for the notification bell — depends only on tenant id from shared profile context
  useEffect(() => {
    const tid = profile?.tenantId
    if (!tid) return
    Promise.all([
      supabase.from('test_transfers').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'ממתין'),
    ]).then(([pt]) => {
      setPendingTestTransfer(pt.count ?? 0)
    })
  }, [profile?.tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+K focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => runSearch(trimmed), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, field, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSelected(0) }, [results])

  const filteredResults = results

  async function runSearch(term: string) {
    const seq = ++searchSeq.current
    let found: SearchResult[] = []
    try { found = await runGlobalSearch(supabase, term, field, kind) } catch { /* show "no results" */ }
    if (seq !== searchSeq.current) return // a newer search already started
    setResults(found)
    setLoading(false)
  }

  function go(r: SearchResult) {
    router.push(r.href)
    setQ('')
    setResults([])
    setFocused(false)
    setMobileSearchOpen(false)
  }

  function highlight(text: string) {
    const q2 = q.trim()
    if (!q2) return <>{text}</>
    const idx = text.toLowerCase().indexOf(q2.toLowerCase())
    if (idx === -1) return <>{text}</>
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fef08a', borderRadius: '2px', padding: '0 1px' }}>{text.slice(idx, idx + q2.length)}</mark>
        {text.slice(idx + q2.length)}
      </>
    )
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape')    { setQ(''); setResults([]); setFocused(false); setMobileSearchOpen(false); e.currentTarget.blur() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filteredResults.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filteredResults[selected]) go(filteredResults[selected])
  }

  const showDropdownResults = focused && q.trim().length >= 2

  const initials = userName
    ? userName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2)
    : userEmail ? userEmail[0].toUpperCase() : '?'

  const timeStr = now
    ? now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '--:--:--'

  const dateStr = (() => {
    if (!now) return ''
    const greg    = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(now)
    const weekday = greg.find(p => p.type === 'weekday')?.value ?? ''
    const day     = greg.find(p => p.type === 'day')?.value ?? ''
    const month   = greg.find(p => p.type === 'month')?.value ?? ''
    const year    = greg.find(p => p.type === 'year')?.value ?? ''
    const heb     = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(now)
    const hDayRaw   = heb.find(p => p.type === 'day')?.value   ?? ''
    const hMonthRaw = heb.find(p => p.type === 'month')?.value ?? ''
    const hYearRaw  = heb.find(p => p.type === 'year')?.value  ?? ''
    const isNumeric = (s: string) => /^\d+$/.test(s.trim())
    const hDay   = isNumeric(hDayRaw)  ? toHebrewLetters(parseInt(hDayRaw))        : hDayRaw.replace(/[׳״'""]/g, '')
    const hYear  = isNumeric(hYearRaw) ? toHebrewLetters(parseInt(hYearRaw), true) : hYearRaw.replace(/[׳״'""]/g, '')
    const hMonth = hMonthRaw.replace(/^ב/, '').replace(/[׳״'""]/g, '')
    return `${weekday} | ${day} ${month} ${year} | ${hDay} ${hMonth} ${hYear}`
  })()

  return (
    <header style={{
      position: 'fixed', top: 0, right: 0, left: 0,
      height: 'var(--header-h)',
      background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: '12px', zIndex: 100,
    }}>

      {/* ── Mobile search overlay (covers full header) ── */}
      {mobileSearchOpen && (
        <div style={{
          position: 'absolute', inset: 0, background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 12px', zIndex: 1,
        }}>
          <button
            onClick={() => { setMobileSearchOpen(false); setQ(''); setResults([]) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text)', flexShrink: 0, padding: '4px 8px', lineHeight: 1 }}
            aria-label="סגור חיפוש"
          >←</button>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={mobileInputRef}
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={onKey}
              autoComplete="off"
              spellCheck={false}
              placeholder="חיפוש לקוח, רכב, חשבונית..."
              style={{
                width: '100%', height: '38px',
                paddingRight: '12px', paddingLeft: '10px',
                border: `1px solid ${focused ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: showDropdownResults ? '8px 8px 0 0' : '8px',
                background: 'var(--bg)', fontSize: '14px',
                outline: 'none', direction: 'rtl', color: 'var(--text)',
              }}
            />
            {showDropdownResults && (
              <div style={{
                position: 'fixed', top: 'var(--header-h)', right: 0, left: 0,
                background: 'var(--bg-card)', border: '1px solid var(--primary)',
                borderTop: 'none', maxHeight: '60vh', overflowY: 'auto', zIndex: 500,
              }}>
                {filteredResults.length === 0 && !loading && (
                  <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>לא נמצאו תוצאות</div>
                )}
                {filteredResults.map((r, i) => (
                  <div
                    key={`mob-${r.key}`}
                    onMouseDown={() => go(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '11px 16px', cursor: 'pointer', direction: 'rtl',
                      background: i === selected ? 'var(--bg)' : 'transparent',
                      borderBottom: i < filteredResults.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(r.primary)}</div>
                      {r.secondary && <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(r.secondary)}</div>}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>{r.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <SearchFilter field={field} kind={kind} onField={setField} onKind={setKind} />
        </div>
      )}

      {/* Hamburger – mobile only */}
      <button
        className="header-hamburger"
        onClick={onMenuToggle}
        aria-label="תפריט ניווט"
      >☰</button>

      {/* Logo / business branding */}
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {tenantLogo
            ? <img src={tenantLogo} alt="לוגו" style={{ width: 42, height: 42, borderRadius: '10px', objectFit: 'contain', flexShrink: 0 }} />
            : <img src="/icon-512.png" alt="AutoFlow" style={{ width: 42, height: 42, borderRadius: '10px', objectFit: 'contain', flexShrink: 0 }} />
          }
        </Link>
      </div>

      {/* Clock */}
      <div className="header-clock" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <div className="header-clock-time num" style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{timeStr}</div>
        <div className="header-clock-date" style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{dateStr}</div>
      </div>

      {/* Search + Avatar */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>

        {/* Mobile search button – icon only */}
        <button
          className="header-search-mobile-btn"
          onClick={() => { setMobileSearchOpen(true); setTimeout(() => mobileInputRef.current?.focus(), 50) }}
          aria-label="חיפוש"
        ><svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>

        {/* Desktop / tablet: full inline search */}
        <div ref={searchRef} className="header-search-desktop" style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', right: '10px', fontSize: '15px', pointerEvents: 'none', zIndex: 1 }}>
              {loading ? (
                <span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', display: 'inline-block', animation: 'spin .6s linear infinite' }} />
              ) : <span style={{ color: 'var(--text-muted)', display: 'flex' }}><svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>}
            </span>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={e => { e.currentTarget.removeAttribute('readonly'); setFocused(true) }}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={onKey}
              readOnly
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              placeholder="חיפוש בכל המערכת — לקוח, רכב, חשבונית, צמיג"
              aria-label="חיפוש בכל המערכת"
              style={{
                paddingRight: '34px', paddingLeft: `${filterW + (q || focused ? 0 : 54)}px`, height: '38px',
                border: `1px solid ${focused ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: showDropdownResults ? '8px 8px 0 0' : '8px',
                background: 'var(--bg-card)', fontSize: '13.5px', width: 'min(420px, 34vw)',
                outline: 'none', direction: 'rtl', color: 'var(--text)',
                transition: 'border-color .15s',
              }}
            />
            <div ref={filterBoxRef} style={{ position: 'absolute', left: '5px', zIndex: 1 }}>
              <SearchFilter field={field} kind={kind} onField={setField} onKind={setKind} />
            </div>
            {!q && !focused && (
              <span style={{
                position: 'absolute', left: `${filterW}px`,
                background: 'var(--border)', borderRadius: '4px',
                padding: '2px 5px', fontSize: '10px', fontWeight: 700,
                color: 'var(--text-muted)', fontFamily: 'monospace',
                pointerEvents: 'none', whiteSpace: 'nowrap',
              }}>Ctrl+K</span>
            )}
          </div>

          {/* Dropdown results */}
          {showDropdownResults && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, width: '320px',
              background: 'var(--bg-card)', border: '1px solid var(--primary)',
              borderTop: 'none', borderRadius: '0 0 10px 10px',
              boxShadow: '0 8px 24px rgba(0,0,0,.15)',
              maxHeight: '420px', overflowY: 'auto', zIndex: 500,
            }}>
              {filteredResults.length === 0 && !loading && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                  לא נמצאו תוצאות
                </div>
              )}
              {filteredResults.map((r, i) => (
                <div
                  key={r.key}
                  onMouseDown={() => go(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 12px', cursor: 'pointer', direction: 'rtl',
                    background: i === selected ? 'var(--bg)' : 'transparent',
                    borderBottom: i < filteredResults.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{r.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {highlight(r.primary)}
                    </div>
                    {r.secondary && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {highlight(r.secondary)}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
                    {r.category}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bell */}
        {(() => {
          const total = pendingTestTransfer
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setShowBell(v => !v)}
                aria-label="התראות"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px', lineHeight: 1, position: 'relative',
                  fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                🔔
                {total > 0 && (
                  <span style={{
                    position: 'absolute', top: 0, right: 0,
                    background: 'var(--danger)', color: '#fff', borderRadius: '50%',
                    fontSize: '9px', fontWeight: 700, lineHeight: 1,
                    width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>{total > 9 ? '9+' : total}</span>
                )}
              </button>

              {showBell && (
                <>
                  <div onClick={() => setShowBell(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,.15)',
                    minWidth: '230px', zIndex: 200, overflow: 'hidden', direction: 'rtl',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '13px', color: 'var(--text-muted)' }}>
                      ממתינים לטיפול
                    </div>
                    {total === 0 && (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                        הכל מטופל ✓
                      </div>
                    )}
                    {pendingTestTransfer > 0 && (
                      <Link
                        href="/test-transfer"
                        onClick={() => setShowBell(false)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', textDecoration: 'none', color: 'var(--text)' }}
                      >
                        <span style={{ fontSize: '18px', flexShrink: 0 }}>🚗</span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{pendingTestTransfer} שינועים לטסטים</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ממתינים לטיפול</div>
                        </div>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* Avatar */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setShowDropdown(v => !v)}
            title={userName || userEmail}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '14px', cursor: 'pointer', flexShrink: 0, userSelect: 'none',
            }}
          >
            {initials}
          </div>
          {showDropdown && <UserDropdown name={userName} email={userEmail} onClose={() => setShowDropdown(false)} />}
        </div>

      </div>
    </header>
  )
}
