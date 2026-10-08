'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useProfile } from '@/lib/contexts/ProfileContext'

// Admin-only nudge when the business has no backup from the last 7 days (manual download,
// manual Drive backup or the nightly automatic one). Dismissable for the browser session.

const STALE_MS = 7 * 86_400_000
const DISMISS_KEY = 'backup-reminder-dismissed'

export default function BackupReminder() {
  const { profile } = useProfile()
  const [dismissed, setDismissed] = useState(true)   // decided after mount — no SSR/hydration flash
  const [now, setNow] = useState(0)
  useEffect(() => {
    let d = false
    try { d = sessionStorage.getItem(DISMISS_KEY) === '1' } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(d); setNow(Date.now())
  }, [])

  if (!profile?.isAdmin || !profile.tenant || dismissed || !now) return null
  // Before migration 086 the column doesn't exist at all — don't nag about a feature not set up.
  if (!('last_backup_at' in profile.tenant)) return null
  const last = profile.tenant.last_backup_at as string | null
  if (last && now - new Date(last).getTime() < STALE_MS) return null

  const days = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null

  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: '#fffbeb', border: '1px solid #fcd34d', color: '#78350f',
      borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14,
    }}>
      <span style={{ fontWeight: 700 }}>
        ⚠️ {days === null ? 'עדיין לא בוצע גיבוי לנתוני העסק' : `לא בוצע גיבוי כבר ${days} ימים`}
      </span>
      <Link href="/settings?tab=backup" style={{ color: '#78350f', fontWeight: 700, textDecoration: 'underline' }}>לגיבוי עכשיו</Link>
      <button onClick={() => { try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {} setDismissed(true) }}
        aria-label="הסתר תזכורת"
        style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#78350f' }}>✕</button>
    </div>
  )
}
