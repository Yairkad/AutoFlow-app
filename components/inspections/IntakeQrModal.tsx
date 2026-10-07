'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// The business's fixed pre-fill link as a QR: show, copy, print as a poster, or replace it.

const ACCENT = '#0b5c55'

function printPoster(qr: string, url: string, businessName: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>בדיקת קנייה – ברקוד</title>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@600;800&display=block" rel="stylesheet">
<style>@page{size:A4;margin:16mm}body{margin:0;font-family:'Assistant',sans-serif;color:#15201e;text-align:center}
.wrap{display:flex;flex-direction:column;align-items:center;gap:18px;padding-top:10mm}
.biz{font-size:26px;font-weight:600;color:#45524f}.title{font-size:60px;font-weight:800;color:${ACCENT};line-height:1}
.sub{font-size:26px;font-weight:600;line-height:1.4}img{width:110mm;height:110mm}
.steps{font-size:20px;line-height:1.7;color:#45524f}.url{font-size:13px;color:#45524f;direction:ltr}</style></head>
<body><div class="wrap"><div class="biz">${esc(businessName)}</div><div class="title">בדיקת קנייה</div>
<div class="sub">סרקו את הקוד ומלאו פרטים לפני ההגעה</div>
<img src="${qr}" onload="setTimeout(function(){window.focus();window.print()},400)">
<div class="steps">1. פרטים אישיים · 2. פרטי הרכב · 3. צילום תעודת זהות ורישיון רכב</div>
<div class="url">${esc(url)}</div></div></body></html>`)
  w.document.close()
}

export default function IntakeQrModal({ businessName, onClose }: { businessName: string; onClose: () => void }) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [url, setUrl]       = useState('')
  const [qr, setQr]         = useState('')
  const [canRegen, setCanRegen] = useState(false)
  const [error, setError]   = useState('')
  const [busy, setBusy]     = useState(false)

  async function apply(res: Response) {
    const j = await res.json()
    if (!res.ok) throw new Error(j.error ?? 'שגיאה')
    const link = `${window.location.origin}/intake/${j.token}`
    setUrl(link)
    setCanRegen(!!j.canRegenerate)
    setQr(await QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b3b36', light: '#ffffff' } }))
  }

  useEffect(() => {
    fetch('/api/inspection-intake/public-link').then(apply).catch(e => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function copy() {
    try { await navigator.clipboard.writeText(url); showToast('הקישור הועתק ✓', 'success') }
    catch { window.prompt('העתק את הקישור:', url) }
  }

  async function regenerate() {
    const ok = await confirm({ msg: 'להחליף את הקישור? ברקודים שכבר הודפסו יפסיקו לעבוד ותצטרך להדפיס חדש.', variant: 'danger' })
    if (!ok) return
    setBusy(true)
    try { await apply(await fetch('/api/inspection-intake/public-link', { method: 'POST' })); showToast('נוצר קישור חדש', 'success') }
    catch (e) { showToast(e instanceof Error ? e.message : 'שגיאה', 'error') }
    finally { setBusy(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 599, background: 'rgba(0,0,0,0.45)' }} />
      <div role="dialog" aria-label="ברקוד לבדיקת קנייה" style={{
        position: 'fixed', zIndex: 600, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        background: 'var(--bg-card)', borderRadius: 'var(--radius)', boxShadow: '0 10px 40px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>📱 ברקוד / קישור קבוע</span>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            אותו קישור לכל הלקוחות – לתלות בעסק, לשים באתר או לשלוח בקבוצות.
            כל מילוי מופיע כאן ברשימה כטופס חדש.
          </div>
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {!qr && !error && <div style={{ color: 'var(--text-muted)', padding: 40 }}>טוען...</div>}
          {qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="ברקוד לטופס בדיקת קנייה" style={{ width: 240, height: 240, border: '1px solid var(--border)', borderRadius: 12 }} />
              <div dir="ltr" style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{url}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button onClick={() => printPoster(qr, url, businessName)}>🖨️ הדפס שלט</Button>
                <Button variant="secondary" onClick={copy}>🔗 העתק קישור</Button>
              </div>
              {canRegen && (
                <button onClick={regenerate} disabled={busy} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{busy ? '...' : 'החלף קישור (מבטל ברקודים ישנים)'}</button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
