'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

type DriveItem = { id: string; name: string; mimeType: string; size?: string; createdTime?: string; thumbnailLink?: string; webViewLink?: string }

// The business's "מסמכים" folder in Google Drive: browse folders, upload / scan, create folders, delete.
// Lives in Settings (it used to be a tab of the documents screen).
export default function DriveFilesPanel() {
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const isMobile = useIsMobile()
  const tenantId = profile?.tenantId ?? ''

  const [connected, setConnected]       = useState<boolean | null>(null)
  const [items, setItems]               = useState<DriveItem[]>([])
  const [loading, setLoading]           = useState(false)
  const [progress, setProgress]         = useState<{ done: number; total: number } | null>(null)
  const [showScanner, setShowScanner]   = useState(false)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [stack, setStack]               = useState<{ id: string; name: string }[]>([])
  const rootId                          = useRef('')
  const [newFolder, setNewFolder]       = useState<string | null>(null)
  const [creating, setCreating]         = useState(false)

  const load = useCallback(async (folderId: string) => {
    if (!tenantId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/drive/files?tenant_id=${tenantId}${folderId ? `&folder_id=${folderId}` : ''}`)
      const data = await res.json()
      if (data.error === 'token_expired') { showToast('חיבור Drive פג — חבר מחדש (כפתור Drive בראש העמוד)', 'error'); setItems([]); return }
      if (data.error === 'rebuild_failed') { showToast('שגיאה בשחזור Drive — חבר מחדש', 'error'); setItems([]); return }
      if (data.rebuilt) showToast('תיקיות Drive נוצרו מחדש אוטומטית ✓', 'success')
      if (!folderId && data.folderId) rootId.current = data.folderId
      setItems(data.files ?? [])
    } catch { /* network — keep the last list */ }
    finally { setLoading(false) }
  }, [tenantId, showToast])

  useEffect(() => {
    if (!tenantId) return
    fetch(`/api/drive/status?tenant_id=${tenantId}`).then(r => r.json())
      .then(d => { setConnected(!!d.connected); if (d.connected) load('') })
      .catch(() => setConnected(false))
  }, [tenantId, load])

  const currentId = () => stack.length ? stack[stack.length - 1].id : rootId.current

  function into(item: { id: string; name: string }) { setStack(s => [...s, item]); load(item.id) }
  function back() {
    const s = stack.slice(0, -1)
    setStack(s)
    load(s.length ? s[s.length - 1].id : '')
  }

  async function upload(files: FileList | File[]) {
    const arr = Array.from(files)
    if (!tenantId || !arr.length) return
    setProgress({ done: 0, total: arr.length })
    const target = currentId()
    let done = 0
    for (const file of arr) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('tenant_id', tenantId)
        if (target) fd.append('folder_id', target); else fd.append('sub_folder', 'מסמכים')
        const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error()
      } catch { showToast(`שגיאה בהעלאת ${file.name}`, 'error') }
      done++
      setProgress({ done, total: arr.length })
    }
    showToast(`הועלו ${done}/${arr.length} קבצים ✓`, 'success')
    setProgress(null)
    load(currentId())
  }

  async function remove(item: DriveItem) {
    if (!(await confirm({ msg: `למחוק את "${item.name}" מהדרייב?`, variant: 'danger' }))) return
    setDeletingId(item.id)
    try {
      await fetch('/api/drive/delete', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, file_id: item.id }),
      })
      showToast('נמחק', 'success')
      setItems(p => p.filter(f => f.id !== item.id))
    } catch { showToast('שגיאה במחיקה', 'error') }
    setDeletingId(null)
  }

  async function createFolder() {
    const name = newFolder?.trim()
    if (!name || !tenantId) return
    if (!rootId.current) { showToast('עדיין טוען... נסה שוב', 'error'); load(''); return }
    setCreating(true)
    try {
      const res = await fetch('/api/drive/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, parent_id: currentId(), name }),
      })
      if (!res.ok) throw new Error()
      showToast('תיקיה נוצרה ✓', 'success')
      setNewFolder(null)
      load(currentId())
    } catch { showToast('שגיאה ביצירת תיקיה', 'error') }
    setCreating(false)
  }

  if (connected === null) return <div style={{ padding: 30, color: 'var(--text-muted)' }}>טוען...</div>
  if (!connected) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Google Drive לא מחובר</div>
      <div style={{ fontSize: 13 }}>חבר אותו בכפתור &quot;Drive&quot; בראש עמוד ההגדרות.</div>
    </div>
  )

  const btn: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {stack.length > 0 && <button type="button" onClick={back} style={btn}>→ חזור</button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>מסמכים</span>
          {stack.map((f, i) => (
            <span key={f.id}><span style={{ margin: '0 2px' }}>/</span>
              <span style={{ color: i === stack.length - 1 ? 'var(--text)' : 'var(--primary)', fontWeight: 600 }}>{f.name}</span>
            </span>
          ))}
        </div>
        {newFolder !== null ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)} aria-label="שם תיקיה"
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolder(null) }}
              placeholder="שם תיקיה..." className="form-input" style={{ width: 150, margin: 0 }} />
            <Button size="sm" onClick={createFolder} loading={creating} disabled={!newFolder.trim()}>צור</Button>
            <button type="button" onClick={() => setNewFolder(null)} style={btn} aria-label="ביטול">✕</button>
          </div>
        ) : (
          <button type="button" onClick={() => setNewFolder('')} disabled={loading} style={btn}>תיקיה חדשה</button>
        )}
        <input type="file" id="drive-panel-upload" style={{ display: 'none' }} multiple
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
        {isMobile && <button type="button" onClick={() => setShowScanner(true)} disabled={!!progress} style={btn}>סרוק</button>}
        <label htmlFor="drive-panel-upload" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: '#fff', borderRadius: 8,
          padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: progress ? 'default' : 'pointer', opacity: progress ? 0.7 : 1,
          pointerEvents: progress ? 'none' : 'auto',
        }}>
          {progress ? `מעלה ${progress.done}/${progress.total}` : 'העלה קבצים'}
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>טוען...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 700 }}>תיקיה ריקה</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>העלה קובץ או צור תיקיה חדשה</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {items.map(item => {
            const isFolder = item.mimeType === 'application/vnd.google-apps.folder'
            const isImage  = item.mimeType?.startsWith('image/')
            const isPdf    = item.mimeType === 'application/pdf'
            if (isFolder) return (
              <button key={item.id} type="button" onClick={() => into({ id: item.id, name: item.name })}
                style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'right' }}>
                <span aria-hidden="true" style={{ fontSize: 24 }}>📁</span>
                <span style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>{item.name}</span>
              </button>
            )
            return (
              <div key={item.id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <a href={item.webViewLink} target="_blank" rel="noreferrer" style={{ display: 'block', height: 100, background: 'var(--bg-soft)' }}>
                  {isImage
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`https://drive.google.com/thumbnail?id=${item.id}&sz=w400`} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 34 }}>{isPdf ? '📄' : '📎'}</div>}
                </a>
                <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3 }}>{item.name}</div>
                  {item.size && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(parseInt(item.size) / 1024).toFixed(0)} KB</div>}
                  <div style={{ display: 'flex', gap: 5, marginTop: 'auto' }}>
                    <a href={item.webViewLink} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 12, padding: '4px 0', background: 'var(--bg-soft)', borderRadius: 6, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>פתח</a>
                    <button type="button" onClick={() => remove(item)} disabled={deletingId === item.id} aria-label={`מחק ${item.name}`}
                      style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {deletingId === item.id ? '...' : 'מחק'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showScanner && (
        <DocumentScannerModal onComplete={file => { setShowScanner(false); upload([file]) }} onClose={() => setShowScanner(false)} />
      )}
    </div>
  )
}
