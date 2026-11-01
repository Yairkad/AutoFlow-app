'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { printHtml } from '@/lib/print/printHtml'

// Free document editor (2026-10): a blank A4 page; add text boxes anywhere, drag them, resize
// them, and style each one (size, bold / italic / underline, color, alignment) — like a simple
// Word page. Saved in `documents` as type 'free_doc' with content { boxes, letterhead }.
// The page is 595 × 842 px (A4 in points); print maps it 1:1 onto 210 × 297 mm.

export interface FreeBox {
  id: string
  x: number; y: number; w: number; h: number
  text: string
  size: number
  bold?: boolean; italic?: boolean; underline?: boolean
  color: string
  align: 'right' | 'center' | 'left'
}
export interface FreeDocContent { boxes: FreeBox[]; letterhead: boolean }
export interface BizHeader { name: string; sub: string; phone: string; address: string; logo: string; license?: string }

export const PAGE_W = 595, PAGE_H = 842
const MARGIN = 40, SNAP = 6
const COLORS = ['#141A2E', '#26357A', '#B9342D', '#137A55', '#5B6478']
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40]
const newBox = (y: number): FreeBox => ({ id: crypto.randomUUID(), x: 48, y, w: 300, h: 40, text: 'טקסט חדש', size: 16, color: '#141A2E', align: 'right' })

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The business's official letterhead — the same layout as "כותרת עסק ריקה" in print templates
// (בס"ד, business details on the right, logo + services line on the left, rule underneath),
// drawn in page px (A4 = 595 px wide, so 1 mm ≈ 2.83 px). Used on screen and in print.
export const LETTERHEAD_H = 150
export function letterheadHtml(b: BizHeader) {
  return `<div style="position:absolute;top:28px;right:42px;left:42px;font-family:inherit;color:#000">
    <div style="font-size:8px;font-weight:700;text-align:right;margin-bottom:2px">בס"ד</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:11px;border-bottom:1.5px solid #000">
      <div style="font-size:10px;font-weight:700;line-height:1.45">
        <div style="font-size:12.5px;font-weight:800">${esc(b.name)}</div>
        ${b.sub ? `<div>${esc(b.sub)}</div>` : ''}${b.address ? `<div>${esc(b.address)}</div>` : ''}
        ${b.phone ? `<div>טל׳: ${esc(b.phone)}</div>` : ''}${b.license ? `<div>מס׳ רישיון מוסך: ${esc(b.license)}</div>` : ''}
      </div>
      <div style="text-align:center">
        ${b.logo ? `<img src="${b.logo}" alt="" style="max-height:82px;max-width:180px;object-fit:contain;display:block;margin:0 auto">` : ''}
        <div style="font-size:7px;font-weight:700;margin-top:3px;letter-spacing:.3px;color:#333">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
      </div>
    </div></div>`
}

/** Opens a print window with the page laid out exactly as in the editor */
export function printFreeDoc(name: string, content: FreeDocContent, biz: BizHeader) {
  const mm = 210 / PAGE_W
  const boxes = content.boxes.map(b => `<div style="position:absolute;top:${b.y}px;left:${b.x}px;width:${b.w}px;font-size:${b.size}px;
    font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? 'italic' : 'normal'};text-decoration:${b.underline ? 'underline' : 'none'};
    color:${b.color};text-align:${b.align};white-space:pre-wrap;line-height:1.5;padding:4px 6px">${esc(b.text)}</div>`).join('')
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(name)}</title>
<style>@page{size:A4;margin:0}html,body{margin:0}body{font-family:'IBM Plex Sans Hebrew','Heebo',Arial,sans-serif;color:#141A2E}
.page{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;transform:scale(${(mm * 96 / 25.4).toFixed(4)});transform-origin:top right;overflow:hidden}</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@400;700&display=swap"></head>
<body><div class="page">${content.letterhead ? letterheadHtml(biz) : ''}${boxes}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`
  printHtml(html)
}

export default function FreeDocEditor({ initialName, initialContent, biz, onSave, onClose }: {
  initialName: string
  initialContent: FreeDocContent | null
  biz: BizHeader
  onSave: (name: string, content: FreeDocContent) => Promise<void>
  onClose: () => void
}) {
  const [name, setName]   = useState(initialName)
  const [boxes, setBoxes] = useState<FreeBox[]>(initialContent?.boxes ?? [newBox(LETTERHEAD_H + 20)])
  const [letterhead, setLetterhead] = useState(initialContent?.letterhead ?? true)
  const [selId, setSelId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [guide, setGuide]   = useState<'center' | 'margin' | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const sel = boxes.find(b => b.id === selId) ?? null

  const patch = (id: string, p: Partial<FreeBox>) => setBoxes(bs => bs.map(b => b.id === id ? { ...b, ...p } : b))

  // Drag a box by its border area; clicks inside go to typing
  function startDrag(e: React.PointerEvent<HTMLDivElement>, b: FreeBox) {
    setSelId(b.id)
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    if (e.clientX < r.left + 14 && e.clientY > r.bottom - 14) return          // resize corner (RTL: bottom-left)
    if (document.activeElement === el) return                                  // already typing
    const sx = e.clientX, sy = e.clientY, x0 = b.x, y0 = b.y
    let moved = false
    const mv = (ev: PointerEvent) => {
      moved = true
      let x = Math.max(0, Math.min(PAGE_W - b.w, x0 + ev.clientX - sx))
      // Snap to the page centre and to the side margins (a guide line shows while snapped)
      const centre = (PAGE_W - b.w) / 2
      const snapTo = [centre, MARGIN, PAGE_W - MARGIN - b.w].find(t => Math.abs(x - t) < SNAP)
      if (snapTo !== undefined) x = snapTo
      setGuide(snapTo === centre ? 'center' : snapTo !== undefined ? 'margin' : null)
      patch(b.id, { x, y: Math.max(0, Math.min(PAGE_H - 20, y0 + ev.clientY - sy)) })
    }
    const up = () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up)
      setGuide(null)
      if (!moved) el.focus()
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up)
    e.preventDefault()
  }

  // Keep the stored size in step with the CSS resize handle
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const ro = new ResizeObserver(entries => {
      for (const en of entries) {
        const el = en.target as HTMLElement, id = el.dataset.id
        if (!id) continue
        setBoxes(bs => bs.map(b => b.id === id && b.w !== el.offsetWidth ? { ...b, w: el.offsetWidth } : b))
      }
    })
    page.querySelectorAll<HTMLElement>('[data-id]').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [boxes.length])

  async function save() {
    if (!name.trim()) { alert('תן שם למסמך'); return }
    setSaving(true)
    try { await onSave(name.trim(), { boxes, letterhead }) } finally { setSaving(false) }
  }

  const tool: React.CSSProperties = { height: 32, minWidth: 32, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }
  const on = (v?: boolean): React.CSSProperties => v ? { background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' } : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input className="form-input" aria-label="שם המסמך" value={name} onChange={e => setName(e.target.value)} placeholder="שם המסמך" style={{ maxWidth: 320, margin: 0 }} />
        <span style={{ marginInlineStart: 'auto' }} />
        <Button variant="secondary" onClick={() => printFreeDoc(name || 'מסמך', { boxes, letterhead }, biz)}>הדפס / PDF</Button>
        <Button variant="success" onClick={save} loading={saving}>שמור</Button>
        <Button variant="ghost" onClick={onClose}>סגור</Button>
      </div>

      <div role="toolbar" aria-label="כלי עריכה" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, position: 'sticky', top: 0, zIndex: 3 }}>
        <Button size="sm" onClick={() => { const b = newBox(Math.min(PAGE_H - 60, LETTERHEAD_H + 20 + boxes.length * 50)); setBoxes(bs => [...bs, b]); setSelId(b.id) }}>+ תיבת טקסט</Button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>
          גודל
          <select aria-label="גודל גופן" disabled={!sel} value={sel?.size ?? 16} onChange={e => sel && patch(sel.id, { size: Number(e.target.value) })}
            style={{ height: 32, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-card)', fontFamily: 'inherit' }}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" style={{ ...tool, fontWeight: 700, ...on(sel?.bold) }} disabled={!sel} aria-pressed={!!sel?.bold} aria-label="מודגש" onClick={() => sel && patch(sel.id, { bold: !sel.bold })}>B</button>
        <button type="button" style={{ ...tool, fontStyle: 'italic', ...on(sel?.italic) }} disabled={!sel} aria-pressed={!!sel?.italic} aria-label="נטוי" onClick={() => sel && patch(sel.id, { italic: !sel.italic })}>I</button>
        <button type="button" style={{ ...tool, textDecoration: 'underline', ...on(sel?.underline) }} disabled={!sel} aria-pressed={!!sel?.underline} aria-label="קו תחתון" onClick={() => sel && patch(sel.id, { underline: !sel.underline })}>U</button>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        {COLORS.map(c => (
          <button key={c} type="button" aria-label={`צבע ${c}`} disabled={!sel} onClick={() => sel && patch(sel.id, { color: c })}
            style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: '2px solid var(--bg-card)', boxShadow: sel?.color === c ? '0 0 0 2px var(--primary)' : '0 0 0 1px var(--border)' }} />
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>טקסט</span>
        {(['right', 'center', 'left'] as const).map(a => (
          <button key={a} type="button" style={{ ...tool, padding: '0 10px', fontSize: 12.5, ...on(sel?.align === a) }} disabled={!sel} aria-pressed={sel?.align === a}
            aria-label={`יישור טקסט ל${a === 'right' ? 'ימין' : a === 'center' ? 'מרכז' : 'שמאל'}`}
            onClick={() => sel && patch(sel.id, { align: a })}>{a === 'right' ? '⇥' : a === 'center' ? '≡' : '⇤'}</button>
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>מיקום בדף</span>
        {([
          ['ימין', (b: FreeBox) => ({ x: PAGE_W - MARGIN - b.w })],
          ['מרכז', (b: FreeBox) => ({ x: Math.round((PAGE_W - b.w) / 2) })],
          ['שמאל', () => ({ x: MARGIN })],
          ['רוחב מלא', () => ({ x: MARGIN, w: PAGE_W - 2 * MARGIN })],
        ] as const).map(([label, fn]) => (
          <button key={label} type="button" style={{ ...tool, padding: '0 10px', fontSize: 12.5 }} disabled={!sel}
            onClick={() => sel && patch(sel.id, fn(sel))}>{label}</button>
        ))}
        <Button size="sm" variant="danger" disabled={!sel} onClick={() => { if (sel) { setBoxes(bs => bs.filter(b => b.id !== sel.id)); setSelId(null) } }}>מחק תיבה</Button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginInlineStart: 'auto' }}>
          <input type="checkbox" checked={letterhead} onChange={e => setLetterhead(e.target.checked)} /> כותרת העסק בראש הדף
        </label>
      </div>

      <div style={{ overflowX: 'auto', padding: 18, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10 }}
        onPointerDown={e => { if (e.target === e.currentTarget) setSelId(null) }}>
        <div ref={pageRef} aria-label="דף A4" style={{ position: 'relative', width: PAGE_W, height: PAGE_H, margin: '0 auto', background: '#fff', color: '#141A2E', boxShadow: '0 4px 24px rgba(20,26,46,.18)' }}
          onPointerDown={e => { if (e.target === e.currentTarget) setSelId(null) }}>
          {letterhead && <div aria-hidden="true" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: letterheadHtml(biz) }} />}
          {guide === 'center' && <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: PAGE_W / 2, width: 1, background: '#B9342D', opacity: .6, pointerEvents: 'none' }} />}
          {boxes.map(b => (
            <div key={b.id} data-id={b.id} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="תיבת טקסט"
              onPointerDown={e => startDrag(e, b)}
              // drop the empty line an Enter + delete leaves behind, so the box shrinks back
              onBlur={e => patch(b.id, { text: e.currentTarget.innerText.replace(/\n+$/, '') })}
              style={{
                position: 'absolute', left: b.x, top: b.y, width: b.w, minHeight: b.size * 1.5 + 10, padding: '4px 6px',
                fontSize: b.size, fontWeight: b.bold ? 700 : 400, fontStyle: b.italic ? 'italic' : 'normal',
                textDecoration: b.underline ? 'underline' : 'none', color: b.color, textAlign: b.align,
                whiteSpace: 'pre-wrap', lineHeight: 1.5, outline: 0, cursor: selId === b.id ? 'text' : 'move',
                border: `1px dashed ${selId === b.id ? '#26357A' : 'transparent'}`, borderRadius: 4,
                boxShadow: selId === b.id ? '0 0 0 3px rgba(38,53,122,.12)' : 'none',
                resize: selId === b.id ? 'horizontal' : 'none', overflow: 'hidden', direction: 'rtl',
              }}>
              {b.text}
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        גוררים תיבה כדי להזיז אותה (היא נצמדת למרכז ולשוליים), מושכים את הפינה כדי לשנות רוחב, ולוחצים פנימה כדי לכתוב. הגובה מתאים את עצמו לטקסט.
      </p>
    </div>
  )
}
