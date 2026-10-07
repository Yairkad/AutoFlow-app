'use client'

import { useEffect, useState } from 'react'
import { intakeFileLabel, type IntakeFile } from '@/lib/inspections/intake'

// Shows the documents a customer uploaded through the pre-fill link, with one-click print per
// document. Print uses a standalone window (same technique as printChecklist) — no app layout.

type SignedFile = IntakeFile & { url: string | null }

export function printIntakeFile(f: SignedFile, title: string) {
  if (!f.url) return
  if (f.type === 'application/pdf') { window.open(f.url, '_blank'); return } // browser PDF viewer has its own print
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>@page{margin:10mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}
img{max-width:100%;max-height:100vh;object-fit:contain}</style></head>
<body><img src="${f.url}" onload="setTimeout(function(){window.focus();window.print()},150)"></body></html>`)
  w.document.close()
}

export default function IntakeFilesModal({ inspectionId, title, onClose }: {
  inspectionId: string
  title: string
  onClose: () => void
}) {
  const [files, setFiles] = useState<SignedFile[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/inspection-intake/files?id=${inspectionId}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'שגיאה')
        setFiles(j.files)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'שגיאה בטעינת המסמכים'))
  }, [inspectionId])

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
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {!files && !error && <div style={{ color: 'var(--text-muted)' }}>טוען...</div>}
          {files && files.length === 0 && <div style={{ color: 'var(--text-muted)' }}>הלקוח לא העלה מסמכים</div>}
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
