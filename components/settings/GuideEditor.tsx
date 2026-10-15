'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DEFAULT_GUIDE, resolveGuide, type GuideContent, type GuideSection, type GuideTopic, type L } from '@/lib/guide/content'

// Settings → דף נחיתה → מדריך צמיגים: edit the public tire guide (/guide/<token>), images, and its QR.
// Content is saved as one JSON on tenants.guide_content; "reset" sets it back to null (= built-in default).

type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void

const MAX_IMG_SIDE = 1200

/** Always recompress to a ~100–200KB JPEG data URL (stored inside guide_content). */
async function compressToDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  const img = await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = src })
  const scale = Math.min(1, MAX_IMG_SIDE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/jpeg', 0.75)
  return out.length < src.length ? out : src
}

function printPoster(qr: string, url: string, businessName: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>מדריך צמיגים – ברקוד</title>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@600;800&display=block" rel="stylesheet">
<style>@page{size:A4;margin:16mm}body{margin:0;font-family:'Assistant',sans-serif;color:#0f172a;text-align:center}
.wrap{display:flex;flex-direction:column;align-items:center;gap:16px;padding-top:10mm}
.biz{font-size:26px;font-weight:600;color:#475569}.title{font-size:56px;font-weight:800;color:#0b3d91;line-height:1.05}
.sub{font-size:24px;font-weight:600;line-height:1.4}.en{font-size:20px;color:#475569;direction:ltr}img{width:105mm;height:105mm}
.url{font-size:13px;color:#475569;direction:ltr}</style></head>
<body><div class="wrap"><div class="biz">${esc(businessName)}</div><div class="title">מה עשינו לרכב שלך?</div>
<div class="sub">סרקו והבינו: כיוון פרונט · מידע על הצמיגים · תיקון פנצ׳ר</div>
<div class="en">Scan to learn what we did to your car — Hebrew &amp; English</div>
<img src="${qr}" onload="setTimeout(function(){window.focus();window.print()},400)">
<div class="url">${esc(url)}</div></div></body></html>`)
  w.document.close()
}

function LField({ label, value, onChange, showEn, multiline }: { label: string; value: L; onChange: (v: L) => void; showEn: boolean; multiline?: boolean }) {
  const Comp = multiline ? 'textarea' : 'input'
  const style: React.CSSProperties = multiline ? { minHeight: 110, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 } : {}
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="form-label">{label}</label>
      <Comp className="form-input" style={style} value={value.he} onChange={e => onChange({ ...value, he: e.target.value })} />
      {showEn && (
        <Comp className="form-input" dir="ltr" style={{ ...style, marginTop: 6, background: '#f8fafc' }} placeholder="English"
          value={value.en} onChange={e => onChange({ ...value, en: e.target.value })} />
      )}
    </div>
  )
}

function ImageField({ image, credit, onChange, showToast }: {
  image?: string | null; credit?: string | null
  onChange: (image: string | null, credit: string | null) => void; showToast: ToastFn
}) {
  const [busy, setBusy] = useState(false)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { showToast('יש לבחור קובץ תמונה', 'error'); return }
    setBusy(true)
    try { onChange(await compressToDataUrl(f), credit ?? null) }
    catch { showToast('לא ניתן לקרוא את התמונה', 'error') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ marginBottom: 10, padding: 10, border: '1px dashed var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ width: 90, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
        )}
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
          {busy ? 'דוחס...' : image ? '🔄 החלף תמונה' : '🖼️ הוסף תמונה'}
          <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {image && (
          <button onClick={() => onChange(null, null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13 }}>✕ הסר</button>
        )}
      </div>
      {image && (
        <input className="form-input" style={{ marginTop: 8, fontSize: 12 }} placeholder='קרדיט לתמונה (אם צריך), למשל: Image by X on Freepik'
          value={credit ?? ''} onChange={e => onChange(image, e.target.value || null)} />
      )}
    </div>
  )
}

function QrBox({ businessName, showToast }: { businessName: string; showToast: ToastFn }) {
  const { confirm } = useConfirm()
  const [url, setUrl] = useState('')
  const [qr, setQr]   = useState('')
  const [canRegen, setCanRegen] = useState(false)
  const [error, setError] = useState('')

  async function apply(res: Response) {
    const j = await res.json()
    if (!res.ok) throw new Error(j.error ?? 'שגיאה')
    const link = `${window.location.origin}/guide/${j.token}`
    setUrl(link)
    setCanRegen(!!j.canRegenerate)
    setQr(await QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }))
  }
  useEffect(() => {
    fetch('/api/guide/public-link').then(apply).catch(e => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function copy() {
    try { await navigator.clipboard.writeText(url); showToast('הקישור הועתק ✓', 'success') }
    catch { window.prompt('העתק את הקישור:', url) }
  }
  async function regenerate() {
    if (!await confirm({ msg: 'להחליף את הקישור? ברקודים שכבר הודפסו יפסיקו לעבוד.', variant: 'danger' })) return
    try { await apply(await fetch('/api/guide/public-link', { method: 'POST' })); showToast('נוצר קישור חדש', 'success') }
    catch (e) { showToast(e instanceof Error ? e.message : 'שגיאה', 'error') }
  }

  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
  if (!qr) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>טוען ברקוד...</div>
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)', marginBottom: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="ברקוד למדריך הצמיגים" style={{ width: 120, height: 120, borderRadius: 8, border: '1px solid var(--border)' }} />
      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>הקישור הציבורי של המוסך שלך — לתלות בעסק או לשלוח ללקוח.</div>
        <div dir="ltr" style={{ fontSize: 12, wordBreak: 'break-all' }}>{url}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => printPoster(qr, url, businessName)}>🖨️ הדפס שלט</Button>
          <Button variant="secondary" onClick={copy}>🔗 העתק</Button>
          <Button variant="secondary" onClick={() => window.open(url, '_blank')}>👁️ צפה בדף</Button>
        </div>
        {canRegen && (
          <button onClick={regenerate} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            החלף קישור (מבטל ברקודים ישנים)
          </button>
        )}
      </div>
    </div>
  )
}

export default function GuideEditor({ supabase, tenantId, showToast }: { supabase: ReturnType<typeof createClient>; tenantId: string; showToast: ToastFn }) {
  const { confirm } = useConfirm()
  const [content, setContent] = useState<GuideContent | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [topicId, setTopicId] = useState(DEFAULT_GUIDE.topics[0].id)
  const [showEn, setShowEn]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    supabase.from('tenants').select('name, guide_content').eq('id', tenantId).maybeSingle().then(({ data, error }) => {
      if (error) console.error('[guide-editor] load', error)
      setBusinessName(data?.name ?? '')
      setContent(resolveGuide(data?.guide_content))
    })
  }, [supabase, tenantId])

  if (!content) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>
  const topic = content.topics.find(t => t.id === topicId) ?? content.topics[0]

  function update(next: GuideContent) { setContent(next); setDirty(true) }
  function updateTopic(patch: Partial<GuideTopic>) {
    update({ ...content!, topics: content!.topics.map(t => t.id === topic.id ? { ...t, ...patch } : t) })
  }
  function updateSection(id: string, patch: Partial<GuideSection>) {
    updateTopic({ sections: topic.sections.map(s => s.id === id ? { ...s, ...patch } : s) })
  }
  function moveSection(idx: number, dir: -1 | 1) {
    const arr = [...topic.sections]; const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    updateTopic({ sections: arr })
  }
  function addSection() {
    updateTopic({ sections: [...topic.sections, { id: 's' + Date.now().toString(36), title: { he: 'נושא חדש', en: '' }, body: { he: '', en: '' } }] })
  }
  async function removeSection(s: GuideSection) {
    if (!await confirm({ msg: `למחוק את "${s.title.he}"?`, variant: 'danger' })) return
    updateTopic({ sections: topic.sections.filter(x => x.id !== s.id) })
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('tenants').update({ guide_content: content }).eq('id', tenantId)
    setSaving(false)
    if (error) { console.error('[guide-editor] save', error); showToast('שגיאה בשמירה', 'error'); return }
    setDirty(false); showToast('המדריך נשמר ✓', 'success')
  }
  async function resetAll() {
    if (!await confirm({ msg: 'להחזיר את כל המדריך לתוכן ברירת המחדל? כל העריכות והתמונות יימחקו.', variant: 'danger' })) return
    const { error } = await supabase.from('tenants').update({ guide_content: null }).eq('id', tenantId)
    if (error) { showToast('שגיאה', 'error'); return }
    setContent(DEFAULT_GUIDE); setDirty(false); showToast('הוחזר לברירת המחדל', 'success')
  }

  return (
    <div>
      <QrBox businessName={businessName} showToast={showToast} />

      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        טקסט: כל שורה היא פסקה. שורה שמתחילה ב-&quot;- &quot; היא נקודה ברשימה. <b>**מילים**</b> בין שתי כוכביות יוצגו מודגשות.
        הציורים (קמבר, טואו, מידת צמיג וכו׳) מוצגים אוטומטית בנושאים המתאימים.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10 }}>
          {content.topics.map(t => (
            <button key={t.id} onClick={() => setTopicId(t.id)} style={{
              padding: '6px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
              fontWeight: t.id === topic.id ? 700 : 400, background: t.id === topic.id ? '#fff' : 'transparent',
              boxShadow: t.id === topic.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none', color: t.enabled ? 'var(--text)' : 'var(--text-muted)',
            }}>{t.title.he}{!t.enabled && ' (מוסתר)'}</button>
          ))}
        </div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={showEn} onChange={e => setShowEn(e.target.checked)} /> הצג גם שדות אנגלית
        </label>
      </div>

      {/* Page header texts */}
      <details style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--bg-card)' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>כותרות הדף הראשי</summary>
        <div style={{ marginTop: 10 }}>
          <LField label="כותרת" value={content.title} showEn={showEn} onChange={v => update({ ...content, title: v })} />
          <LField label="שורת פתיחה" value={content.lead} showEn={showEn} onChange={v => update({ ...content, lead: v })} />
          <LField label="הערה בתחתית" value={content.footerNote} showEn={showEn} onChange={v => update({ ...content, footerNote: v })} />
        </div>
      </details>

      {/* Topic */}
      <div style={{ border: '1px solid var(--primary)', borderRadius: 12, padding: 14, background: 'var(--bg-card)', marginBottom: 14 }}>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={topic.enabled} onChange={e => updateTopic({ enabled: e.target.checked })} /> להציג את הקובייה הזאת בדף
        </label>
        <LField label="שם הקובייה" value={topic.title} showEn={showEn} onChange={v => updateTopic({ title: v })} />
        <LField label="תיאור קצר (מתחת לשם בקובייה)" value={topic.summary} showEn={showEn} onChange={v => updateTopic({ summary: v })} />
        <LField label="פתיחה (בראש הדף של הנושא)" value={topic.intro} showEn={showEn} multiline onChange={v => updateTopic({ intro: v })} />
        <label className="form-label">תמונה בראש הדף</label>
        <ImageField image={topic.image} credit={topic.imageCredit} showToast={showToast} onChange={(image, imageCredit) => updateTopic({ image, imageCredit })} />
      </div>

      {topic.sections.map((s, i) => (
        <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-card)', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.diagram ? '✏️ כולל ציור הסבר' : `נושא ${i + 1}`}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button title="למעלה" onClick={() => moveSection(i, -1)} disabled={i === 0} style={iconBtn}>▲</button>
              <button title="למטה" onClick={() => moveSection(i, 1)} disabled={i === topic.sections.length - 1} style={iconBtn}>▼</button>
              <button title="מחק" onClick={() => removeSection(s)} style={{ ...iconBtn, color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
          <LField label="כותרת" value={s.title} showEn={showEn} onChange={v => updateSection(s.id, { title: v })} />
          <LField label="טקסט" value={s.body} showEn={showEn} multiline onChange={v => updateSection(s.id, { body: v })} />
          <ImageField image={s.image} credit={s.imageCredit} showToast={showToast} onChange={(image, imageCredit) => updateSection(s.id, { image, imageCredit })} />
        </div>
      ))}

      <button onClick={addSection} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        + הוסף נושא
      </button>

      <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button onClick={resetAll} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
          החזר הכל לברירת המחדל
        </button>
        <Button onClick={save} loading={saving} disabled={!dirty}>💾 {dirty ? 'שמור שינויים' : 'נשמר'}</Button>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '2px 7px', color: 'var(--text-muted)' }
