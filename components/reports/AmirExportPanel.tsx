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

/** One click → the three Excel files Amir Tazrim asked for, saved into a chosen folder. */
export default function AmirExportPanel({ tenantId }: { tenantId: string }) {
  const supabase = useRef(createClient()).current
  const { profile, refresh } = useProfile()
  const settings = (profile?.tenant?.settings ?? {}) as Record<string, unknown>
  const lastExport = typeof settings.amir_last_export === 'string' ? settings.amir_last_export : null

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [warnings, setWarnings] = useState<{ file: string; items: string[] }[]>([])

  const run = async () => {
    setBusy(true); setMsg(null); setWarnings([])
    try {
      const files = await buildAmirFiles(supabase, tenantId)
      const folder = await saveFiles(FOLDER_KEY, files)
      const counts = files.map(f => `${f.name.replace(/\.xlsx$/, '')}: ${f.rows}`).join(' · ')
      setMsg({ ok: true, text: `${folder ? `נשמרו ${files.length} קבצים בתיקייה "${folder}" (במקום הקודמים)` : `הורדו ${files.length} קבצים`} — ${counts}` })
      setWarnings(files.filter(f => f.missingRef.length).map(f => ({ file: f.name.replace(/\.xlsx$/, ''), items: f.missingRef })))
      const day = today()
      const { data: t } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
      await supabase.from('tenants').update({ settings: { ...(t?.settings ?? {}), amir_last_export: day } }).eq('id', tenantId)
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
          3 קבצים: חשבוניות ספקים פתוחות · שיקים והעברות · תקבולים (חשבוניות לקוחות פתוחות)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <Button onClick={run} loading={busy} loadingText="מייצא...">ייצא לאמיר</Button>
        {canPickFolder() && (
          <Button variant="ghost" size="sm" onClick={async () => { await pickFolder(FOLDER_KEY) }}>החלף תיקייה</Button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: 'auto' }}>
          ייצוא אחרון: {lastExport ? fmtDMY(lastExport) : 'עדיין לא'}
        </span>
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
        כל ייצוא הוא המצב הנוכחי המלא ודורס את הקבצים הקודמים: חשבוניות פתוחות (התשלומים סוגרים קודם את הישנות; חשבונית מתויגת &quot;מכוסה&quot; נחשבת סגורה), שיקים שטרם נפרעו וכל ההעברות (כולל קודמות, להצלבה).
      </p>
      {msg && <p role="status" style={{ fontSize: '13px', margin: 0, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</p>}
      {warnings.length > 0 && (
        <div role="alert" style={{ fontSize: '12.5px', background: '#fff7e6', border: '1px solid #f5c26b', borderRadius: '6px', padding: '8px 10px' }}>
          <b>⚠ שורות בלי אסמכתא — כדאי להשלים במערכת ולייצא שוב:</b>
          {warnings.map(w => (
            <div key={w.file} style={{ marginTop: '4px' }}>
              <b>{w.file} ({w.items.length}):</b> {w.items.slice(0, 15).join(' · ')}{w.items.length > 15 ? ` ועוד ${w.items.length - 15}` : ''}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
