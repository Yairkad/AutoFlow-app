'use client'

import { printHtml } from '@/lib/print/printHtml'
import { useCallback, useEffect, useState } from 'react'
import { intakeFileLabel, type IntakeFile } from '@/lib/inspections/intake'
import { MAX_UPLOAD_BYTES, compressImageIfNeeded, compressPdfIfNeeded } from '@/lib/utils/uploadCompress'
import {
  scanWithAgent, listScanners, getSavedScanner, saveScanner, SCANNER_DOWNLOAD_URL,
  ScannerAgentMissingError, ScannerAgentOutdatedError, ScannerDeviceNotFoundError, type ScannerDevice,
} from '@/lib/scannerAgent'

// Shows the documents a customer uploaded through the pre-fill link, with one-click print per
// document. Print uses a standalone window (same technique as printChecklist) — no app layout.

type SignedFile = IntakeFile & { url: string | null }

export function printIntakeFile(f: SignedFile, title: string) {
  if (!f.url) return
  if (f.type === 'application/pdf') { window.open(f.url, '_blank'); return } // browser PDF viewer has its own print
  printHtml(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>@page{margin:10mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}
img{max-width:100%;max-height:100vh;object-fit:contain}</style></head>
<body><img src="${f.url}" onload="setTimeout(function(){window.focus();window.print()},150)"></body></html>`)
}

export default function IntakeFilesModal({ inspectionId, title, onClose, onChanged }: {
  inspectionId: string
  title: string
  onClose: () => void
  /** Called with the new number of documents after a scan / upload / delete */
  onChanged?: (count: number) => void
}) {
  const [files, setFiles] = useState<SignedFile[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState<string | null>(null)   // what is running: 'scan' | 'upload' | path
  const [msg, setMsg]     = useState('')
  const [agentMissing, setAgentMissing] = useState(false)
  const [devices, setDevices] = useState<ScannerDevice[] | null>(null)   // scanner picker (several connected)

  const load = useCallback(() => {
    fetch(`/api/inspection-intake/files?id=${inspectionId}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'שגיאה')
        setFiles(j.files)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'שגיאה בטעינת המסמכים'))
  }, [inspectionId])

  useEffect(() => { load() }, [load])

  // Scanned / chosen file → shrink if needed → saved with the inspection as "מסמך לקוח"
  async function addFile(file: File) {
    setMsg('')
    let shrunk = await compressImageIfNeeded(file)
    shrunk = await compressPdfIfNeeded(shrunk)
    if (shrunk.size > MAX_UPLOAD_BYTES) { setMsg('הקובץ גדול מדי גם אחרי דחיסה (מקסימום כ-4MB) — סרקו באיכות נמוכה יותר'); return }
    const fd = new FormData()
    fd.append('file', shrunk)
    const res = await fetch(`/api/inspection-intake/files?id=${inspectionId}`, { method: 'POST', body: fd })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(j.error ?? 'שגיאה בשמירה'); return }
    onChanged?.(j.count)
    load()
  }

  function agentError(e: unknown) {
    if (e instanceof ScannerAgentMissingError || e instanceof ScannerAgentOutdatedError) setAgentMissing(true)
    if (e instanceof ScannerDeviceNotFoundError) saveScanner(null)
    setMsg(e instanceof Error ? e.message : 'שגיאת סריקה')
  }

  async function scanWith(deviceId: string) {
    setBusy('scan'); setDevices(null)
    try { await addFile(await scanWithAgent(deviceId, `${title || 'מסמך'}.pdf`)) }
    catch (e) { agentError(e) }
    finally { setBusy(null) }
  }

  // Same flow as scanning a supplier invoice: the saved scanner, or pick one when several are connected
  async function scan() {
    const saved = getSavedScanner()
    if (saved) { await scanWith(saved); return }
    try {
      const list = await listScanners()
      if (list.length === 0) { setMsg('לא נמצא סורק מחובר למחשב. ודאו שהמדפסת דולקת ומחוברת'); return }
      if (list.length === 1) { saveScanner(list[0].id); await scanWith(list[0].id); return }
      setDevices(list)
    } catch (e) { agentError(e) }
  }

  async function upload(file: File) {
    setBusy('upload')
    try { await addFile(file) } finally { setBusy(null) }
  }

  async function remove(f: SignedFile) {
    if (!confirm(`למחוק את "${intakeFileLabel(f.kind)}"?`)) return
    setBusy(f.path)
    const res = await fetch(`/api/inspection-intake/files?id=${inspectionId}&path=${encodeURIComponent(f.path)}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg(j.error ?? 'שגיאה במחיקה'); return }
    onChanged?.(j.count)
    load()
  }

  const btn: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--border)',
    background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 599, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'fixed', zIndex: 600, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(720px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: '0 10px 40px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>📎 מסמכים — {title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>
          {/* Add the customer's documents from the office: scanner (like supplier invoices) or a file */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <button type="button" onClick={scan} disabled={busy !== null} style={{ ...btn, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
              {busy === 'scan' ? 'סורק...' : '📠 סרוק מהסורק'}
            </button>
            <label style={{ ...btn, cursor: busy ? 'default' : 'pointer' }}>
              {busy === 'upload' ? 'מעלה...' : '📎 העלה קובץ'}
              <input type="file" accept="application/pdf,image/*" aria-label="העלאת מסמך" style={{ display: 'none' }} disabled={busy !== null}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
            </label>
            {getSavedScanner() && (
              <button type="button" onClick={() => { saveScanner(null); scan() }} disabled={busy !== null}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
                החלף סורק
              </button>
            )}
            {agentMissing && (
              <a href={SCANNER_DOWNLOAD_URL} download style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>⬇ התקנת סורק למחשב</a>
            )}
          </div>
          {devices && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>בחר סורק:</span>
              {devices.map(d => (
                <button key={d.id} type="button" onClick={() => { saveScanner(d.id); scanWith(d.id) }} style={{ ...btn, textAlign: 'right' }}>{d.name}</button>
              ))}
            </div>
          )}
          {msg && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {!files && !error && <div style={{ color: 'var(--text-muted)' }}>טוען...</div>}
          {files && files.length === 0 && <div style={{ color: 'var(--text-muted)' }}>אין עדיין מסמכים — סרקו או העלו את מסמכי הלקוח</div>}
          {files && files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {files.map(f => (
                <div key={f.path} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <a href={f.url ?? '#'} target="_blank" rel="noreferrer"
                    style={{ height: 150, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    {f.type === 'application/pdf' || !f.url
                      ? <span style={{ fontSize: 48 }}>📄</span>
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={f.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                  </a>
                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{intakeFileLabel(f.kind)}</span>
                    <button type="button" aria-label={`מחק ${intakeFileLabel(f.kind)}`} title="מחק" disabled={busy !== null} onClick={() => remove(f)}
                      style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--danger)' }}>🗑</button>
                    <button onClick={() => printIntakeFile(f, `${intakeFileLabel(f.kind)} — ${title}`)}
                      style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      🖨️ הדפס
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
