'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

// ── 21 systems per Ministry of Transportation guidelines ──────────────────────

export const INSPECTION_SYSTEMS = [
  'מנוע',
  'מערכת קירור',
  'מערכת דלק',
  'מערכת הצתה',
  'מערכת פליטה',
  'מערכת היגוי',
  'תיבת הילוכים',
  'מערכת העברת כוח',
  'קפיצים',
  'בולמי זעזועים',
  'מתלה קדמי',
  'מתלה אחורי',
  'מערכת בלמים',
  'בלם עזר',
  'צמיגים',
  'חישוקים',
  'שלדת מרכב',
  'מרכב (פחחות)',
  'אביזרי בטיחות',
  'מערכת תאורה',
  'מחוונים',
]

// ── Common faults per system (for quick-pick dropdown) ────────────────────────

const COMMON_FAULTS: Record<string, string[]> = {
  'מנוע':               ['דליפת שמן', 'רעשים חריגים', 'עשן שחור', 'עשן לבן', 'חוסר כוח', 'רטט חריג', 'לחץ שמן נמוך'],
  'מערכת קירור':        ['דליפת נוזל קירור', 'תרמוסטט פגום', 'מאוורר אינו פועל', 'צינורות סדוקים', 'רדיאטור פגוע'],
  'מערכת דלק':          ['דליפת דלק', 'שאיבת דלק לקויה', 'מסנן סתום', 'חיישן רמת דלק תקול'],
  'מערכת הצתה':         ['נרות הצתה בלויים', 'כבלי הצתה פגומים', 'קופסת הצתה תקולה', 'עמדת הצתה שגויה'],
  'מערכת פליטה':        ['דליפת גזים', 'מחלב סדוק', 'שפופרת חלודה', 'קטליזטור פגום', 'רעש חריג'],
  'מערכת היגוי':        ['ריפוף בהגה', 'דליפת נוזל הגה', 'רעשים בפנייה', 'חוסר ישרות', 'ג׳וינטים בלויים'],
  'תיבת הילוכים':       ['חלקה בהילוכים', 'רעשים', 'דליפת שמן', 'קושי בכניסה להילוך', 'הילוך אחורי תקול'],
  'מערכת העברת כוח':   ['דליפת שמן גיר', 'ג׳וינט CV בלוי', 'רטט בנסיעה', 'ציר פגום'],
  'קפיצים':             ['קפיץ שבור', 'שקיעת קפיץ', 'רעש חריג', 'ריפוף'],
  'בולמי זעזועים':      ['בולם דולף', 'בולם חלוד', 'בולם בלוי', 'רעש מדרגות'],
  'מתלה קדמי':          ['בושינג בלוי', 'ג׳וינט כדורי בלוי', 'זרוע מתלה עקומה', 'מוט סטביליזציה תקול'],
  'מתלה אחורי':         ['בושינג בלוי', 'מוט סטביליזציה תקול', 'נקודות חיבור חלודות', 'זרוע עקומה'],
  'מערכת בלמים':        ['בלאי רפידות', 'דיסק פגוע', 'דליפת נוזל בלמים', 'בולם בלמים תקול', 'עיכוב בלימה'],
  'בלם עזר':            ['בלם יד רפוי', 'כבל בלם יד מתוח', 'מנגנון בלם יד תקול'],
  'צמיגים':             ['בלאי לא אחיד', 'צמיג עם חתך', 'לחץ אוויר נמוך', 'בולטת צד', 'גיל מתקדם'],
  'חישוקים':            ['חישוק פגוע', 'חישוק עקום', 'חישוק חלוד', 'אגוזים חסרים'],
  'שלדת מרכב':          ['חלודה', 'נזק מתאונה', 'ריתוך לא מקורי', 'עיוות מבנה'],
  'מרכב (פחחות)':       ['נזק פח', 'חלודה', 'צבע לא מקורי', 'פאנל מוחלף', 'שריטות עמוקות'],
  'אביזרי בטיחות':      ['חגורת בטיחות תקולה', 'כרית אוויר מחוסרת', 'נעילות ילדים', 'ראי לא תקין'],
  'מערכת תאורה':        ['פנס שבור', 'נורה לא פועלת', 'אורות ערפל תקולים', 'תאורה אחורית פגומה'],
  'מחוונים':            ['מד מהירות תקול', 'מד דלק תקול', 'נורת אזהרה דולקת', 'מד טמפרטורה תקול'],
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  status: 'ok' | 'fail' | ''
  faults: string[]
}

interface InspectionBasic {
  id: string
  plate: string
  make: string | null
  model: string | null
  year: number | null
  km: string | null
  engine_cc: number | null
  chassis: string | null
  color: string | null
  ownership_type: string | null
  owner_name: string
  owner_phone: string | null
  date: string | null
  findings: string | null
}

interface BusinessBasic {
  name: string
  sub_title: string | null
  logo: string | null
  phone: string | null
  address: string | null
  license_number: string | null
}

interface Props {
  inspection: InspectionBasic
  business: BusinessBasic
  onClose: () => void
  onSave: (insId: string, findings: string) => Promise<void>
}

// ── Parse / default ────────────────────────────────────────────────────────────

function parseFindings(raw: string | null): ChecklistItem[] {
  const blank = INSPECTION_SYSTEMS.map(() => ({ status: '' as const, faults: [] }))
  if (!raw) return blank
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === INSPECTION_SYSTEMS.length) {
      // support both old format (notes:string) and new (faults:string[])
      return parsed.map((p: ChecklistItem & { notes?: string }) => ({
        status: p.status ?? '',
        faults: Array.isArray(p.faults) && p.faults.length > 0
          ? p.faults
          : p.notes ? [p.notes] : [],
      }))
    }
  } catch {}
  return blank
}

// ── Print ──────────────────────────────────────────────────────────────────────

function printChecklist(inspection: InspectionBasic, business: BusinessBasic, items: ChecklistItem[]) {
  const date = inspection.date || new Date().toLocaleDateString('he-IL')

  const rowsHTML = INSPECTION_SYSTEMS.map((name, i) => {
    const item   = items[i]
    const isOk   = item.status === 'ok'
    const isFail = item.status === 'fail'
    const notesText = item.faults.filter(Boolean).join(' | ')
    return `
      <tr style="${isFail ? 'background:#fff0f0' : isOk ? 'background:#f0fff4' : ''}">
        <td style="text-align:center;width:26px">${i + 1}</td>
        <td style="text-align:right;padding-right:8px;font-weight:700;width:160px">${name}</td>
        <td style="text-align:center;font-size:15px;color:#16a34a;font-weight:700">${isOk ? '✓' : ''}</td>
        <td style="text-align:center;font-size:15px;color:#dc2626;font-weight:700">${isFail ? '✗' : ''}</td>
        <td style="text-align:right;padding:2px 6px;font-size:10.5px">${notesText}</td>
      </tr>`
  }).join('')

  const failItems = INSPECTION_SYSTEMS
    .map((name, i) => ({ name, item: items[i] }))
    .filter(x => x.item.status === 'fail')

  const summaryHTML = failItems.length === 0
    ? '<p style="color:#16a34a;font-weight:700;font-size:11px">✓ לא נמצאו ליקויים — הרכב תקין בכל המערכות שנבדקו</p>'
    : failItems.map(x => `<div style="font-size:10.5px;margin-bottom:3px"><strong>✗ ${x.name}</strong>${x.item.faults.filter(Boolean).length ? ': ' + x.item.faults.filter(Boolean).join(', ') : ''}</div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ממצאי בדיקה – ${inspection.plate}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; font-size: 11px; line-height: 1.35; }
.page { width: 190mm; }
.hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:5mm; padding-bottom:4mm; border-bottom:2.5px solid #000; }
.biz-name { font-size:16px; font-weight:900; }
.biz-info { font-size:10px; line-height:1.5; margin-top:3px; }
.logo-img { max-height:70px; max-width:180px; object-fit:contain; mix-blend-mode:multiply; }
.title-box { text-align:center; border:2.5px solid #000; padding:5px 8px; margin-bottom:5mm; }
.title-box h1 { font-size:13.5px; font-weight:900; text-decoration:underline; margin:0; }
.title-box p  { font-size:10px; margin:3px 0 0; }
.car-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:3px 8px; margin-bottom:5mm; border:1px solid #ccc; padding:5px 8px; border-radius:4px; }
.car-cell { font-size:11px; padding:1px 0; }
.car-cell b { font-weight:700; }
table { width:100%; border-collapse:collapse; margin-bottom:5mm; font-size:10.5px; }
th { background:#eee !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; border:1px solid #000; padding:3px 4px; text-align:center; font-size:10px; font-weight:700; }
td { border:1px solid #000; padding:2px 4px; vertical-align:middle; }
.summary { border:1.5px solid #000; padding:6px 10px; margin-bottom:4mm; border-radius:3px; }
.summary-title { font-size:11px; font-weight:900; margin-bottom:4px; }
.notes { font-size:9px; line-height:1.5; margin-bottom:4mm; }
.notes p { margin:1px 0; }
.legal-box { border:2px solid #000; padding:5px 8px; font-size:9.5px; font-weight:700; line-height:1.5; margin-bottom:5mm; }
.sigs { display:flex; justify-content:space-around; padding-top:4mm; font-weight:700; font-size:11px; }
.sig-line { border-bottom:1.5px solid #000; width:130px; display:inline-block; min-height:1.3em; margin-right:4px; }
@media screen { body{background:#e5e5e5} .page{background:#fff;margin:10mm auto;padding:10mm;box-shadow:0 2px 10px rgba(0,0,0,.15)} }
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div>
      <div class="biz-name">${business.name}</div>
      ${business.sub_title ? `<div class="biz-info">${business.sub_title}</div>` : ''}
      <div class="biz-info">${[business.address, business.phone ? 'טל׳: ' + business.phone : '', business.license_number ? 'רישיון: ' + business.license_number : ''].filter(Boolean).join(' | ')}</div>
    </div>
    ${business.logo ? `<img class="logo-img" src="${business.logo}" alt="לוגו">` : ''}
  </div>
  <div class="title-box">
    <h1>טופס סיכום אחיד של בדיקה כללית</h1>
    <h1>ללא מערכות אלקטרוניות וממוחשבות</h1>
    <p>(ע"פ הוראות משרד התחבורה)</p>
  </div>
  <div class="car-grid">
    <div class="car-cell"><b>מס׳ רכב:</b> ${inspection.plate}</div>
    <div class="car-cell"><b>דגם:</b> ${inspection.model || ''}</div>
    <div class="car-cell"><b>תוצר:</b> ${inspection.make || ''}</div>
    <div class="car-cell"><b>מס׳ מנוע:</b> ${inspection.engine_cc || ''}</div>
    <div class="car-cell"><b>מס׳ שלדה:</b> ${inspection.chassis || ''}</div>
    <div class="car-cell"><b>שנת ייצור:</b> ${inspection.year || ''}</div>
    <div class="car-cell"><b>ק"מ:</b> ${inspection.km || ''}</div>
    <div class="car-cell"><b>סוג רכב:</b> ${inspection.ownership_type || ''}</div>
    <div class="car-cell"><b>צבע:</b> ${inspection.color || ''}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>מס"ד</th><th>המערכת</th>
        <th style="width:38px">תקין</th><th style="width:38px">לא תקין</th>
        <th>הערות / תוצאות בדיקה</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="summary">
    <div class="summary-title">${failItems.length === 0 ? '✓ סיכום: הרכב תקין' : `⚠️ סיכום ליקויים (${failItems.length}):`}</div>
    ${summaryHTML}
  </div>
  <div class="notes">
    <strong>הערות:</strong>
    <p>1. הממצאים המחייבים את מכון הבדיקה הינם הממצאים המפורטים בכתב בטופס הסיכום. משמעות הליקויים יש לקבל ממכון הבדיקה.</p>
    <p>2. מידע על חומרת הליקויים, והצעת מחיר לתיקון יש לקבל ממוסך מורשה או שמאי רכב בלבד ובאחריות קונה הרכב.</p>
    <p>3. אחריות מכון הבדיקה היא רק על המכללים שנבדקו והמצוינים בטופס הבדיקה בלבד.</p>
    <p>4. אחריות על תוצאות הבדיקה של מערכות מכאניות הינה לתקופה של שלושה חודשים או 6,000 ק"מ לפי המוקדם. אין אחריות למערכות ממוחשבות.</p>
    <p>5. צילום רישיון הרכב ורישיון הנהיגה ישמרו עם טופס הבדיקה לתקופה של 24 חודשים.</p>
    <p>6. אני מזמין הבדיקה מאשר שקראתי והובאו לידיעתי הממצאים הרשומים בטופס הסיכום.</p>
    <p>7. ע"מ למנוע הונאה באמצעות כפל רישיונות, רצוי לבצע בדיקה והתאמה של מספרי מנוע ושלדה עם רישיון הרכב.</p>
  </div>
  <div class="legal-box">להסרת ספק מובהר כי בדיקת הרכב המבוצעת על ידי מכון הבדיקה הינה בדיקה מכנית בדבר מצבו המכני של הרכב ומערכותיו בלבד, בכפוף להצהרה חתומה על ידי מזמין הבדיקה.</div>
  <div class="sigs">
    <div>חתימת הבוחן: <span class="sig-line"></span></div>
    <div>תאריך: <span class="sig-line">${date}</span></div>
    <div>חתימת המזמין: <span class="sig-line"></span></div>
  </div>
</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function InspectionChecklistModal({ inspection, business, onClose, onSave }: Props) {
  const [items,   setItems]   = useState<ChecklistItem[]>(() => parseFindings(inspection.findings))
  const [step,    setStep]    = useState(0)          // 0..20 = systems, 21 = summary
  const [saving,  setSaving]  = useState(false)

  const TOTAL = INSPECTION_SYSTEMS.length
  const isSummary = step === TOTAL

  // ── Item mutations ────────────────────────────────────────────────────────────

  function setStatus(status: 'ok' | 'fail' | '') {
    setItems(prev => prev.map((item, i) => i === step ? { ...item, status } : item))
  }

  function setFault(faultIdx: number, text: string) {
    setItems(prev => prev.map((item, i) => {
      if (i !== step) return item
      const faults = [...item.faults]
      faults[faultIdx] = text
      return { ...item, faults }
    }))
  }

  function addFault() {
    setItems(prev => prev.map((item, i) =>
      i === step ? { ...item, faults: [...item.faults, ''] } : item
    ))
  }

  function removeFault(faultIdx: number) {
    setItems(prev => prev.map((item, i) => {
      if (i !== step) return item
      const faults = item.faults.filter((_, fi) => fi !== faultIdx)
      return { ...item, faults }
    }))
  }

  // ── Navigation ─────────────────────────────────────────────────────────────────

  function goNext() {
    // Auto-mark as ok if no status set and no faults when moving forward
    const cur = items[step]
    if (step < TOTAL && cur.status === '' && cur.faults.filter(Boolean).length === 0) {
      setItems(prev => prev.map((item, i) => i === step ? { ...item, status: 'ok' } : item))
    }
    setStep(s => Math.min(s + 1, TOTAL))
  }

  function goPrev() { setStep(s => Math.max(s - 1, 0)) }

  function jumpTo(i: number) { setStep(i) }

  // ── Save + Print ───────────────────────────────────────────────────────────────

  async function handleSave(andPrint: boolean) {
    setSaving(true)
    await onSave(inspection.id, JSON.stringify(items))
    setSaving(false)
    if (andPrint) printChecklist(inspection, business, items)
    onClose()
  }

  // ── Derived ────────────────────────────────────────────────────────────────────

  const okCount      = items.filter(i => i.status === 'ok').length
  const failCount    = items.filter(i => i.status === 'fail').length
  const cur          = items[step] ?? { status: '', faults: [] }
  const sysName      = INSPECTION_SYSTEMS[step] ?? ''
  const suggestions  = COMMON_FAULTS[sysName] ?? []

  // ── Styles ─────────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px',
    fontSize: 13, background: 'var(--bg)', width: '100%',
    fontFamily: 'inherit', color: 'var(--text)', outline: 'none',
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.5)' }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 620,
        zIndex: 500, background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.2)',
      }}>

        {/* ── Top bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', padding: 4, lineHeight: 1 }}>✕</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>📋 ממצאי בדיקה — <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{inspection.plate}</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {[inspection.make, inspection.model, inspection.year].filter(Boolean).join(' ')}
              {inspection.owner_name ? ` · ${inspection.owner_name}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <span style={{ background: '#f0fdf4', color: 'var(--primary)', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✓ {okCount}</span>
            {failCount > 0 && <span style={{ background: '#fef2f2', color: 'var(--danger)', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✗ {failCount}</span>}
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ height: 4, background: 'var(--border)', flexShrink: 0, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            width: `${((isSummary ? TOTAL : step) / TOTAL) * 100}%`,
            background: 'var(--primary)', transition: 'width 0.3s ease',
          }} />
        </div>

        {/* ── Mini step pills ── */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 18px 6px',
          overflowX: 'auto', flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {INSPECTION_SYSTEMS.map((name, i) => {
            const it = items[i]
            const isActive = i === step && !isSummary
            const bg = it.status === 'ok' ? '#f0fdf4' : it.status === 'fail' ? '#fef2f2' : isActive ? '#eff6ff' : '#f1f5f9'
            const color = it.status === 'ok' ? 'var(--primary)' : it.status === 'fail' ? 'var(--danger)' : isActive ? 'var(--accent)' : 'var(--text-muted)'
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                title={name}
                style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  background: bg, color, cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, transition: 'all .15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {it.status === 'ok' ? '✓' : it.status === 'fail' ? '✗' : i + 1}
              </button>
            )
          })}
          {/* Summary pill */}
          <button
            onClick={() => setStep(TOTAL)}
            title="סיכום"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
              border: isSummary ? '2px solid var(--primary)' : '2px solid transparent',
              background: isSummary ? '#f0fdf4' : '#f1f5f9',
              color: isSummary ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ≡
          </button>
        </div>

        {/* ── Main content area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

          {/* ════ SYSTEM STEP ════ */}
          {!isSummary && (
            <div>
              {/* System title */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 20,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>
                    מערכת {step + 1} מתוך {TOTAL}
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{sysName}</h2>
                </div>
                {/* Quick status toggle */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setStatus(cur.status === 'ok' ? '' : 'ok')}
                    style={{
                      width: 52, height: 52, borderRadius: '50%',
                      border: `2.5px solid ${cur.status === 'ok' ? 'var(--primary)' : '#bbf7d0'}`,
                      background: cur.status === 'ok' ? 'var(--primary)' : '#f0fdf4',
                      color: cur.status === 'ok' ? '#fff' : 'var(--primary)',
                      cursor: 'pointer', fontSize: 22, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s', flexShrink: 0,
                    }}
                    title="תקין"
                  >✓</button>
                  <button
                    onClick={() => setStatus(cur.status === 'fail' ? '' : 'fail')}
                    style={{
                      width: 52, height: 52, borderRadius: '50%',
                      border: `2.5px solid ${cur.status === 'fail' ? 'var(--danger)' : '#fecaca'}`,
                      background: cur.status === 'fail' ? 'var(--danger)' : '#fef2f2',
                      color: cur.status === 'fail' ? '#fff' : 'var(--danger)',
                      cursor: 'pointer', fontSize: 22, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s', flexShrink: 0,
                    }}
                    title="לא תקין"
                  >✗</button>
                </div>
              </div>

              {/* Status label */}
              {cur.status !== '' && (
                <div style={{
                  textAlign: 'center', fontSize: 13, fontWeight: 700,
                  color: cur.status === 'ok' ? 'var(--primary)' : 'var(--danger)',
                  marginBottom: 16,
                }}>
                  {cur.status === 'ok' ? '✓ תקין' : '✗ לא תקין — פרט ליקויים:'}
                </div>
              )}

              {/* Fault lines — shown when fail */}
              {cur.status === 'fail' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cur.faults.length === 0 && (
                    <div
                      style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}
                    >
                      לחץ &ldquo;+ הוסף ליקוי&rdquo; כדי לפרט
                    </div>
                  )}

                  {cur.faults.map((fault, fi) => (
                    <div key={fi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          style={inp}
                          list={`faults-${step}`}
                          placeholder="תאר את הליקוי..."
                          value={fault}
                          onChange={e => setFault(fi, e.target.value)}
                          autoFocus={fi === cur.faults.length - 1}
                        />
                        <datalist id={`faults-${step}`}>
                          {suggestions.map(s => <option key={s} value={s} />)}
                        </datalist>
                      </div>
                      <button
                        onClick={() => removeFault(fi)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--danger)', flexShrink: 0, padding: '4px 6px' }}
                      >✕</button>
                    </div>
                  ))}

                  {/* Common faults quick-pick */}
                  {suggestions.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>ליקויים נפוצים — לחץ להוסיף:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {suggestions
                          .filter(s => !cur.faults.includes(s))
                          .map(s => (
                            <button
                              key={s}
                              onClick={() => setItems(prev => prev.map((item, i) =>
                                i === step ? { ...item, faults: [...item.faults, s], status: 'fail' } : item
                              ))}
                              style={{
                                padding: '4px 10px', borderRadius: 20,
                                border: '1px solid #fecaca', background: '#fef2f2',
                                color: '#991b1b', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', transition: 'all .1s',
                              }}
                            >
                              + {s}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={addFault}
                    style={{
                      alignSelf: 'flex-start', marginTop: 4,
                      padding: '7px 14px', borderRadius: 8,
                      border: '1px dashed var(--border)', background: 'transparent',
                      color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    + הוסף ליקוי
                  </button>
                </div>
              )}

              {/* Quick-pick when no status yet */}
              {cur.status === '' && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  בחר תקין ✓ או לא תקין ✗ למעלה
                </div>
              )}
            </div>
          )}

          {/* ════ SUMMARY STEP ════ */}
          {isSummary && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16, color: 'var(--text)' }}>
                📊 סיכום בדיקה
              </h2>

              {/* Stats bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'תקין', value: okCount,    color: 'var(--primary)',  bg: '#f0fdf4' },
                  { label: 'ליקויים', value: failCount,  color: 'var(--danger)',   bg: '#fef2f2' },
                  { label: 'לא בדוק', value: TOTAL - okCount - failCount, color: 'var(--text-muted)', bg: '#f1f5f9' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Full table preview */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                  טבלת ממצאים מלאה
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                        {['#', 'מערכת', 'תקין', 'ל"ת', 'הערות'].map((h, i) => (
                          <th key={i} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {INSPECTION_SYSTEMS.map((name, i) => {
                        const it = items[i]
                        return (
                          <tr
                            key={i}
                            style={{ borderBottom: '1px solid var(--border)', background: it.status === 'fail' ? '#fef2f2' : it.status === 'ok' ? '#f0fdf4' : undefined, cursor: 'pointer' }}
                            onClick={() => jumpTo(i)}
                          >
                            <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{name}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 14, color: 'var(--primary)', fontWeight: 700 }}>{it.status === 'ok' ? '✓' : ''}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 14, color: 'var(--danger)', fontWeight: 700 }}>{it.status === 'fail' ? '✗' : ''}</td>
                            <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{it.faults.filter(Boolean).join(' | ')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation footer ── */}
        <div style={{
          padding: '12px 18px', background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          {!isSummary ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Previous */}
              <button
                onClick={goPrev}
                disabled={step === 0}
                style={{
                  flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                  border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                  cursor: step === 0 ? 'not-allowed' : 'pointer',
                  opacity: step === 0 ? 0.35 : 1, fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="קודם"
              >‹</button>

              {/* Center info */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step + 1} / {TOTAL}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{sysName}</div>
              </div>

              {/* Next / Finish */}
              <button
                onClick={goNext}
                style={{
                  flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                  border: '1.5px solid var(--primary)', background: 'var(--primary)',
                  color: '#fff', cursor: 'pointer', fontSize: step === TOTAL - 1 ? 14 : 18,
                  fontWeight: step === TOTAL - 1 ? 700 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title={step === TOTAL - 1 ? 'לסיכום' : 'הבא'}
              >
                {step === TOTAL - 1 ? '✓' : '›'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                fullWidth
                onClick={() => handleSave(true)}
                loading={saving}
                style={{ fontSize: 14, fontWeight: 800, padding: '10px 0' }}
              >
                🖨️ שמור והדפס ממצאים
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSave(false)}
                loading={saving}
                style={{ flexShrink: 0, padding: '10px 18px', fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                💾 שמור
              </Button>
              <button
                onClick={() => setStep(0)}
                style={{
                  flexShrink: 0, padding: '10px 14px',
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'white', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)',
                }}
              >← חזור</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Badge helper (exported for history cards) ──────────────────────────────────

export function ChecklistBadge({ findings }: { findings: string | null }) {
  if (!findings) return null
  try {
    const items: ChecklistItem[] = JSON.parse(findings)
    if (!Array.isArray(items)) return null
    const failCount = items.filter(i => i.status === 'fail').length
    const okCount   = items.filter(i => i.status === 'ok').length
    if (failCount === 0 && okCount === 0) return null
    return failCount > 0 ? (
      <span style={{ background: '#fef2f2', color: 'var(--danger)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
        ✗ {failCount} ליקוי{failCount !== 1 ? 'ים' : ''}
      </span>
    ) : (
      <span style={{ background: '#f0fdf4', color: 'var(--primary)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
        ✓ תקין
      </span>
    )
  } catch { return null }
}
