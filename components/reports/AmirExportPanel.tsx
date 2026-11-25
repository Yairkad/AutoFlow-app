'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import Button from '@/components/ui/Button'
import { buildAmirFiles } from '@/lib/reports/amirExport'
import { saveFiles, canPickFolder, pickFolder } from '@/lib/utils/saveToFolder'

const FOLDER_KEY = 'amir-export'
const fmtDMY = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const today = () => new Date().toLocaleDateString('en-CA')

const INPUT: React.CSSProperties = {
  padding: '6px 8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px',
  background: '#fff', color: 'var(--text)', fontFamily: 'inherit',
}

/** One click → the four Excel files Amir Tazrim asked for, saved into a chosen folder. */
export default function AmirExportPanel({ tenantId }: { tenantId: string }) {
  const supabase = useRef(createClient()).current
  const { profile, refresh } = useProfile()
  const settings = (profile?.tenant?.settings ?? {}) as Record<string, unknown>
  const lastExport = typeof settings.amir_last_export === 'string' ? settings.amir_last_export : null

  const [from, setFrom] = useState(lastExport ?? '')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const run = async () => {
    setBusy(true); setMsg(null)
    try {
      const files = await buildAmirFiles(supabase, tenantId, from || null, to || null)
      const folder = await saveFiles(FOLDER_KEY, files)
      const counts = files.map(f => `${f.name.replace(/ \d.*$/, '')}: ${f.rows}`).join(' · ')
      setMsg({ ok: true, text: `${folder ? `נשמרו 4 קבצים בתיקייה "${folder}"` : 'הורדו 4 קבצים'} — ${counts}` })
      const day = today()
      const { data: t } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
      await supabase.from('tenants').update({ settings: { ...(t?.settings ?? {}), amir_last_export: day } }).eq('id', tenantId)
      setFrom(day)
      refresh()
    } catch (e) {
      setMsg({ ok: false, text: 'הייצוא נכשל: ' + (e instanceof Error ? e.message : String(e)) })
    }
    setBusy(false)
  }

  return (
    <section aria-labelledby="amir-export-title" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <h2 id="amir-export-title" style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>ייצוא לאמיר תזרים</h2>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          4 קבצים: חשבוניות ספקים פתוחות · צ&apos;קים והעברות · מזומן ואשראי · תקבולים (חשבוניות לקוחות פתוחות)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
          תשלומים שנרשמו מתאריך
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={INPUT} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
          עד תאריך (לא חובה)
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={INPUT} />
        </label>
        <Button onClick={run} loading={busy} loadingText="מייצא...">ייצא לאמיר</Button>
        {canPickFolder() && (
          <Button variant="ghost" size="sm" onClick={async () => { await pickFolder(FOLDER_KEY) }}>החלף תיקייה</Button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: 'auto' }}>
          ייצוא אחרון: {lastExport ? fmtDMY(lastExport) : 'עדיין לא'}
        </span>
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
        החשבוניות הפתוחות הן תמיד המצב הנוכחי (התשלומים סוגרים קודם את החשבוניות הישנות). טווח התאריכים חל על הצ&apos;קים וההעברות ועל המזומן והאשראי, לפי היום שבו נרשמו במערכת.
      </p>
      {msg && <p role="status" style={{ fontSize: '13px', margin: 0, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</p>}
    </section>
  )
}
