'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FormColumn {
  label: string
  width: 'narrow' | 'medium' | 'wide'
}

interface FormContent {
  columns:          FormColumn[]
  headerExtra:      string
  headerAlign:      'right' | 'center' | 'left'
  headerLine:       boolean
  headerLineLength: 'short' | 'medium' | 'long'
  footerText:       string
}

interface FormDoc {
  id: string
  tenant_id: string
  name: string
  icon: string
  type: string
  content: FormContent
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const emptyForm = {
  name: '', icon: '📋',
  headerExtra: '', headerAlign: 'right' as const,
  headerLine: false, headerLineLength: 'medium' as const,
  footerText: '',
}

const emptyCol: FormColumn = { label: '', width: 'medium' }

const WIDTH_LABEL: Record<string, string>  = { narrow: 'צרה', medium: 'בינונית', wide: 'רחבה' }
const WIDTH_WEIGHT: Record<string, number> = { narrow: 1, medium: 2, wide: 3 }

// ── Print helpers ──────────────────────────────────────────────────────────────

function printFormTemplate(f: FormDoc, copies: number) {
  const cols   = f.content.columns
  const totalW = cols.reduce((s, c) => s + (WIDTH_WEIGHT[c.width] ?? 2), 0)
  const colWidths = cols.map(c => ((WIDTH_WEIGHT[c.width] ?? 2) / totalW * 100).toFixed(2) + '%')

  const n      = cols.length
  const thFont = n <= 4 ? 11 : n <= 7 ? 10 : 9
  const rowH   = n <= 3 ? 10 : n <= 6 ? 8.5 : 7
  const ROWS   = Math.floor(228 / rowH)

  const lineLengths: Record<string, string> = { short: '30mm', medium: '55mm', long: '85mm' }
  const headerExtraHTML = (() => {
    if (!f.content.headerExtra && !f.content.headerLine) return ''
    const align     = f.content.headerAlign      ?? 'right'
    const lineLen   = lineLengths[f.content.headerLineLength ?? 'medium']
    const lineHTML  = f.content.headerLine
      ? `<span style="display:inline-block;border-bottom:1.2px solid #444;width:${lineLen};vertical-align:bottom;margin-right:4pt"></span>`
      : ''
    return `<div class="doc-meta" style="text-align:${align}">${f.content.headerExtra ?? ''}${lineHTML}</div>`
  })()

  const pageHTML = `
    <div class="print-page">
      <div class="doc-header">
        <div class="doc-title" style="text-align:center">${f.name}</div>
        ${headerExtraHTML}
      </div>
      <table>
        <colgroup>${colWidths.map(w => `<col style="width:${w}">`).join('')}</colgroup>
        <thead>
          <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${Array(ROWS).fill(`<tr>${cols.map(() => '<td></td>').join('')}</tr>`).join('\n')}
        </tbody>
      </table>
      ${f.content.footerText ? `<div class="doc-footer">${f.content.footerText}</div>` : ''}
    </div>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:15mm; }
    body { font-family:Arial,'Heebo',sans-serif; direction:rtl; background:#fff; }
    .print-page { width:100%; height:calc(297mm - 30mm); display:flex; flex-direction:column; page-break-after:always; }
    .print-page:last-child { page-break-after:avoid; }
    .doc-header { margin-bottom:8mm; flex-shrink:0; }
    .doc-title  { font-size:16pt; font-weight:bold; margin-bottom:3mm; }
    .doc-meta   { font-size:13pt; color:#333; font-weight:500; margin-top:2mm; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; flex:1; }
    thead th { background:#e8e8e8; font-weight:bold; font-size:${thFont}pt; padding:3mm 2mm; border:1px solid #333; text-align:center; }
    tbody td  { border:1px solid #aaa; padding:1mm 2mm; vertical-align:top; font-size:${thFont}pt; }
    tbody tr  { height:${rowH}mm; }
    .doc-footer { margin-top:6mm; font-size:10pt; color:#444; border-top:1px solid #ccc; padding-top:3mm; flex-shrink:0; }
    @media screen { body { background:#f0f0f0; padding:20px; } .print-page { background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.2); margin-bottom:20px; padding:15mm; } }
  </style>
</head>
<body>
  ${Array(copies).fill(pageHTML).join('\n')}
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

function printChecklist(copies: number, _car: string, _owner: string, _phone: string, logoBase64: string) {
  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" style="max-height:16mm;max-width:38mm;object-fit:contain;display:block"/>`
    : `<div class="logo-ph">לוגו</div>`

  const opt = (...labels: string[]) =>
    labels.map(l => `<span class="opt"><span class="c"></span>${l}</span>`).join('')
  const chk = (...labels: string[]) =>
    labels.map(l => `<span class="chk"><span class="c"></span>${l}</span>`).join('')
  const sec = (label: string) =>
    `<tr class="sec"><td colspan="3">${label}</td></tr>`
  const row = (name: string, status: string, action: string) =>
    `<tr class="item"><td class="ci">${name}</td><td class="cs">${status}</td><td class="ca">${action}</td></tr>`
  const tbl = (header: string, rows: string) =>
    `<table>${header}${rows}</table>`

  const carSVG = `<svg width="96" height="160" viewBox="0 0 96 160">
    <text x="48" y="11" text-anchor="middle" font-size="7.5" fill="#444" font-family="Arial" font-weight="700">קדימה</text>
    <text x="48" y="156" text-anchor="middle" font-size="7.5" fill="#444" font-family="Arial" font-weight="700">אחורה</text>
    <path d="M24,16 L72,16 Q80,16 80,26 L80,134 Q80,144 72,144 L24,144 Q16,144 16,134 L16,26 Q16,16 24,16 Z" fill="#f5f5f5" stroke="#111" stroke-width="2"/>
    <path d="M26,16 L70,16 L68,28 L28,28 Z" fill="#e8e8e8" stroke="#111" stroke-width="1.2"/>
    <path d="M28,132 L68,132 L70,144 L26,144 Z" fill="#e8e8e8" stroke="#111" stroke-width="1.2"/>
    <rect x="29" y="30" width="38" height="20" rx="3" fill="white" stroke="#555" stroke-width="1.2"/>
    <rect x="29" y="110" width="38" height="20" rx="3" fill="white" stroke="#555" stroke-width="1.2"/>
    <line x1="16" y1="80" x2="80" y2="80" stroke="#bbb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="4" y1="55" x2="16" y2="55" stroke="#666" stroke-width="1.5"/>
    <line x1="80" y1="55" x2="92" y2="55" stroke="#666" stroke-width="1.5"/>
    <line x1="4" y1="105" x2="16" y2="105" stroke="#666" stroke-width="1.5"/>
    <line x1="80" y1="105" x2="92" y2="105" stroke="#666" stroke-width="1.5"/>
    <rect x="1" y="41" width="15" height="28" rx="5" fill="#ddd" stroke="#111" stroke-width="2"/>
    <rect x="4" y="45" width="9" height="20" rx="2" fill="none" stroke="#888" stroke-width="1"/>
    <circle cx="8.5" cy="55" r="2" fill="#888"/>
    <rect x="80" y="41" width="15" height="28" rx="5" fill="#ddd" stroke="#111" stroke-width="2"/>
    <rect x="83" y="45" width="9" height="20" rx="2" fill="none" stroke="#888" stroke-width="1"/>
    <circle cx="87.5" cy="55" r="2" fill="#888"/>
    <rect x="1" y="91" width="15" height="28" rx="5" fill="#ddd" stroke="#111" stroke-width="2"/>
    <rect x="4" y="95" width="9" height="20" rx="2" fill="none" stroke="#888" stroke-width="1"/>
    <circle cx="8.5" cy="105" r="2" fill="#888"/>
    <rect x="80" y="91" width="15" height="28" rx="5" fill="#ddd" stroke="#111" stroke-width="2"/>
    <rect x="83" y="95" width="9" height="20" rx="2" fill="none" stroke="#888" stroke-width="1"/>
    <circle cx="87.5" cy="105" r="2" fill="#888"/>
  </svg>`

  const pageHTML = `
  <div class="page">
    <div class="hdr">
      ${logoHTML}
      <div class="doc-meta">
        <div class="doc-title">טופס בדיקה כללית לרכב</div>
        <div class="doc-num">מס':&nbsp;<span class="uline"></span></div>
      </div>
      <div style="width:38mm"></div>
    </div>
    <div class="body">
      <div class="main-col">
        ${tbl(sec('🔘 צמיגים + רזרבי <span class="sub">[תקינות ולחצי אוויר]</span>'),
          `<tr class="item"><td colspan="3"><div class="tire-grid">${chk('צמיג חדש', 'תיקון תקר', 'איזון גלגל', 'החלפת רזרבי')}</div></td></tr>`)}
        ${tbl(sec('🧰 כלי נהג'),
          ['מפתח ברגים', 'אפוד זוהר', "ג'ק", 'גלגל רזרבי']
            .map(n => row(n, opt('יש', 'חסר'), opt('רוצה לקנות'))).join(''))}
        ${tbl(sec('🌧️ מגבים'),
          ['קדמי', 'אחורי']
            .map(n => row(n, opt('תקין', 'לא תקין'), opt('רוצה לקנות'))).join(''))}
        ${tbl(sec('🔧 נוזלי מנוע'),
          ['מים לווישרים', 'שמן מנוע', 'נוזל קירור']
            .map(n => row(n, opt('מלא', 'חסר'), opt('רוצה לקנות'))).join(''))}
        ${tbl(sec('💡 פנסים ותאורה'),
          ['ראשי', 'ברקסים', 'לוחית רישוי', 'חניה', 'וינקרים'].map((n, i) =>
            row(n, opt('תקין', 'לא תקין'), i === 0 ? opt('ליטוש', 'לקנות') : opt('רוצה לקנות'))
          ).join(''))}
        ${tbl(sec('🛒 אביזרים מומלצים'),
          ["ספריי פנצ'ר", 'קומפרסור', 'בוסטר', 'כבלים להנעה']
            .map(n => row(n, opt('יש', 'חסר'), opt('רוצה לקנות'))).join(''))}
      </div>
      <div class="side-col">
        <div class="wheel-box">
          <div class="wb-title">תקינות גלגלים</div>
          ${carSVG}
        </div>
        <div class="wash-box">
          <div class="wb-title">שטיפה מבוקשת</div>
          <div class="wash-row"><span class="c"></span> פנימי</div>
          <div class="wash-row"><span class="c"></span> חיצוני</div>
          <div class="wash-row"><span class="c"></span> מנוע</div>
        </div>
      </div>
    </div>
    <div class="footer">
      <div style="display:flex;align-items:flex-end;gap:6px">
        <span style="white-space:nowrap;font-size:8pt;color:#555">שם בודק:</span>
        <div style="border-bottom:1.5px solid #333;width:55mm"></div>
      </div>
    </div>
  </div>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:0; }
    body { font-family:'Heebo',Arial,sans-serif; direction:rtl; background:#fff; }
    .page { width:210mm; height:297mm; background:#fff; padding:8mm 11mm; display:flex; flex-direction:column; overflow:hidden; page-break-after:always; }
    .page:last-child { page-break-after:avoid; }
    .hdr { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #111; padding-bottom:4mm; margin-bottom:3mm; flex-shrink:0; }
    .logo-ph { width:38mm; height:16mm; border:2px dashed #bbb; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:9pt; color:#aaa; }
    .doc-meta { text-align:center; }
    .doc-title { font-size:15pt; font-weight:900; color:#111; }
    .doc-num { margin-top:3mm; font-size:10pt; color:#444; display:flex; align-items:center; gap:6px; justify-content:center; }
    .uline { display:inline-block; border-bottom:1.5px solid #333; width:40mm; }
    .info-strip { display:flex; background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; overflow:hidden; margin-bottom:4mm; flex-shrink:0; }
    .inf { flex:1; padding:3px 10px; border-left:1px solid #e0e0e0; }
    .inf:last-child { border-left:none; }
    .lbl { font-size:7.5pt; color:#999; display:block; }
    .inf strong { font-size:10.5pt; }
    .body { display:flex; gap:5mm; flex:1; }
    .main-col { flex:1; overflow:hidden; }
    .side-col { width:28mm; flex-shrink:0; }
    table { width:100%; border-collapse:collapse; margin-bottom:2mm; font-size:9pt; border:1.5px solid #333; }
    tr.sec { background:#111; color:#fff; }
    tr.sec td { padding:2mm 3mm; font-size:10pt; font-weight:700; }
    tr.sec .sub { font-size:8pt; font-weight:400; opacity:.75; }
    tr.item td { padding:1.8mm 3mm; border-bottom:1px solid #ddd; border-right:1px solid #ccc; vertical-align:middle; line-height:1.4; }
    tr.item td:first-child { border-right:none; }
    tr.item:last-child td { border-bottom:none; }
    tr.item:nth-child(even) { background:#f9f9f9; }
    .ci { width:32%; font-weight:600; color:#111; }
    .cs { width:38%; color:#333; }
    .ca { width:30%; color:#555; font-size:8.5pt; text-align:center; }
    .opt { display:inline-flex; align-items:center; gap:3px; margin-left:6px; white-space:nowrap; }
    .opt .c { display:inline-block; width:11px; height:11px; border:1.5px solid #444; border-radius:50%; flex-shrink:0; }
    .chk { display:inline-flex; align-items:center; gap:4px; margin-left:8px; white-space:nowrap; font-weight:600; }
    .chk .c { display:inline-block; width:13px; height:13px; border:1.5px solid #444; border-radius:3px; flex-shrink:0; }
    .tire-grid { display:flex; gap:8mm; padding:2mm 3mm; flex-wrap:wrap; }
    .wheel-box, .wash-box { border:1.5px solid #333; border-radius:6px; padding:3mm 2mm; text-align:center; margin-bottom:4mm; }
    .wb-title { font-size:8pt; font-weight:700; color:#111; margin-bottom:2.5mm; border-bottom:1px solid #bbb; padding-bottom:1.5mm; }
    .wash-box { text-align:right; }
    .wash-row { display:flex; align-items:center; gap:5px; margin-bottom:2mm; font-size:8.5pt; font-weight:500; }
    .wash-row .c { display:inline-block; width:11px; height:11px; border:1.5px solid #444; border-radius:50%; flex-shrink:0; }
    .footer { margin-top:5mm; display:flex; justify-content:flex-end; flex-shrink:0; }
    @media screen { body { background:#e5e7eb; padding:30px; } .page { box-shadow:0 4px 32px rgba(0,0,0,.18); } }
  </style>
</head>
<body>
  ${Array(copies).fill(pageHTML).join('\n')}
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── printWarranty ─────────────────────────────────────────────────────────────
// Blank version of inspection Page 1 – identical layout, empty fields for manual fill

function printWarranty(copies: number, bizNameStr: string, logoBase64: string, subTitle: string, phone: string, address: string, license: string) {
  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" class="pp-logo-img" alt="לוגו"/>`
    : ``

  const pageHTML = `
  <div class="pp">
    <div class="pp-bsd">בס"ד</div>

    <div class="pp-hdr">
      <div class="pp-biz">
        <div class="pp-biz-name">${bizNameStr}</div>
        ${subTitle  ? `<div style="font-size:12px">${subTitle}</div>`  : ''}
        ${address   ? `<div>${address}</div>`   : ''}
        ${phone     ? `<div>טל׳: ${phone}</div>` : ''}
        ${license   ? `<div>מס׳ רישיון מוסך: ${license}</div>` : ''}
      </div>
      <div class="pp-logo-wrap">
        ${logoHTML}
        <div class="pp-logo-svc">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
      </div>
    </div>

    <div class="pp-doc-titles">
      <h2>הצהרה על-פי הוראת נוהל מחייבת (2/98) של משרד התחבורה למדדים לבדיקת רכב לצרכי קניה ומכירה</h2>
      <h1>דו"ח קליטה – בדיקת רכב</h1>
    </div>

    <div class="pp-info-grid">
      <div class="pp-info-section">
        <h3>פרטי הלקוח</h3>
        <div class="pp-info-row"><span>מס׳ רכב:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>שם הלקוח:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>כתובת:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>טלפון:</span><div class="pp-line"></div></div>
      </div>
      <div class="pp-info-section">
        <h3>פרטי הרכב</h3>
        <div class="pp-info-row"><span>שנת ייצור:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>תוצר הרכב:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>ק"מ:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>מס׳ מנוע:</span><div class="pp-line"></div></div>
        <div class="pp-info-row"><span>מס׳ שילדה:</span><div class="pp-line"></div></div>
      </div>
    </div>

    <div class="pp-legal">
      אני <span class="pp-blank-wide"></span> ת.ז. <span class="pp-blank-narrow"></span>
      <br/><br/>
      מזמין בזאת את בדיקת הרכב אשר פרטיו מפורטים ברישיון הרכב. ידוע לי, כי הבדיקה הינה מכנית בלבד ותפקידה לבדוק את מצבו המכני של הרכב ומערכותיו.
      <br/><br/>
      ידוע לי, כי מכון הבדיקה אינו אחראי בכל דרך שהיא לזיופים או שינויים כלשהם בנתונים ו/או במספרים כלשהם ברכב ו/או במסמכיו, לרבות ברישיון הרכב ולתוצאותיהם של הללו, וכי מכון הבדיקה מבצע הבדיקה בכפוף ובהסתמך על הצהרתי זו.
      <ul class="pp-bullets">
        <li>יש לבדוק תצרוכת שמן בנסיעה !!</li>
        <li>אין אחריות על מערכות אלקטרוניות, מחשבי הרכב וכריות אויר !</li>
        <li>מומלץ לבדוק את רציפות הטיפול לק"מ.</li>
        <li>מומלץ לבדוק את מקוריות הרכב במשרד הרישוי.</li>
      </ul>
      <div class="pp-warn">
        <h4>⚠️ חשוב ביותר!!!</h4>
        עם גילוי ליקויים שלא נתגלו בבדיקה – אין אנו אחראים אם התיקון ו/או הבדיקה בוצעו במקום אחר לפני שהרכב נבדק על ידינו שנית.<br/>
        החברה אינה אחראית על ליקויים או מגרעות אשר לא נתגלו בבדיקה זו כתוצאה מהעלמת ליקויים במתכוון.<br/>
        דו"ח זה יפה כוחו לגבי מזמין הבדיקה בלבד.
      </div>
      <p style="margin-top:8px;font-size:13px;">
        אני <span style="display:inline-block;width:160px;border-bottom:1px solid #000;vertical-align:bottom"></span>
        מצהיר/ה בזאת כי הוסברו לי כל הליקויים המתייחסים לדו"ח זה על כל חלקיו.
      </p>
    </div>

    <div class="pp-sig">
      <div class="pp-sig-item"><div class="pp-sig-line"></div><span>תאריך</span></div>
      <div class="pp-sig-item"><div class="pp-sig-line"></div><span>חתימת מזמין הבדיקה</span></div>
      <div class="pp-sig-item"><div class="pp-sig-line"></div><span>חתימת הבודק</span></div>
    </div>
  </div>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:0; }
    body { font-family:'Heebo',Arial,sans-serif; direction:rtl; background:#fff; }
    .pp { width:210mm; height:296mm; padding:10mm 15mm; display:flex; flex-direction:column; page-break-after:always; }
    .pp:last-child { page-break-after:avoid; }
    .pp-bsd { text-align:right; font-weight:bold; font-size:11px; margin-bottom:3px; }
    .pp-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:4mm; padding-bottom:4mm; border-bottom:2px solid #000; }
    .pp-biz { font-weight:bold; font-size:13px; line-height:1.4; }
    .pp-biz-name { font-size:16px; font-weight:900; }
    .pp-logo-wrap { text-align:center; }
    .pp-logo-img { max-height:140px; max-width:300px; object-fit:contain; display:block; margin:0 auto; }
    .pp-logo-svc { font-size:9px; text-align:center; font-weight:bold; margin-top:4px; letter-spacing:0.5px; color:#333; }
    .pp-doc-titles { text-align:center; margin-bottom:4mm; }
    .pp-doc-titles h2 { font-size:12px; border-top:1px solid #000; border-bottom:1px solid #000; padding:3px 0; margin:4px 0; font-weight:bold; }
    .pp-doc-titles h1 { font-size:22px; margin:5px 0; text-decoration:underline; font-weight:900; }
    .pp-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-bottom:4mm; }
    .pp-info-section h3 { font-size:16px; border-bottom:2px solid #000; margin-bottom:5px; font-weight:900; }
    .pp-info-row { display:flex; align-items:baseline; margin-bottom:6px; font-size:14px; }
    .pp-info-row span { white-space:nowrap; font-weight:600; }
    .pp-line { border-bottom:1px solid #000; flex-grow:1; margin-right:6px; min-height:1.3em; }
    .pp-legal { font-size:13.5px; line-height:1.5; text-align:justify; flex-grow:1; }
    .pp-blank-wide { display:inline-block; border-bottom:1px solid #000; min-width:130px; padding:0 12px; font-weight:bold; vertical-align:bottom; }
    .pp-blank-narrow { display:inline-block; border-bottom:1px solid #000; min-width:100px; padding:0 12px; font-weight:bold; vertical-align:bottom; }
    .pp-bullets { margin:8px 0; list-style-type:"❖ "; padding-right:20px; font-weight:bold; font-size:13px; }
    .pp-bullets li { margin-bottom:3px; }
    .pp-warn { border:2.5px solid #000; padding:8px 12px; margin:8px 0; background:#f5f5f5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .pp-warn h4 { margin:0 0 4px 0; text-decoration:underline; font-size:15px; }
    .pp-sig { margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; padding-top:8px; border-top:1px dashed #ccc; }
    .pp-sig-item { width:30%; text-align:center; font-size:13px; }
    .pp-sig-line { border-bottom:1.5px solid #000; margin-bottom:4px; min-height:1.5em; }
    @media screen { body { background:#e5e7eb; padding:30px; } .pp { box-shadow:0 4px 32px rgba(0,0,0,.18); background:#fff; } }
  </style>
</head>
<body>
  ${Array(copies).fill(pageHTML).join('\n')}
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocumentsClient() {
  const sb         = useRef(createClient()).current
  const tenantId   = useRef<string>('')
  const bizName    = useRef<string>('')
  const bizSubTitle    = useRef<string>('')
  const bizPhone       = useRef<string>('')
  const bizAddress     = useRef<string>('')
  const bizLicense     = useRef<string>('')
  const logoBase64 = useRef<string>('')
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [forms,   setForms]   = useState<FormDoc[]>([])
  const [loading, setLoading] = useState(true)

  // ── Template modal ────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [meta,     setMeta]     = useState<{ name: string; icon: string; headerExtra: string; headerAlign: 'right' | 'center' | 'left'; headerLine: boolean; headerLineLength: 'short' | 'medium' | 'long'; footerText: string }>(emptyForm)
  const [columns,  setColumns]  = useState<FormColumn[]>([{ ...emptyCol }])
  const [saving,   setSaving]   = useState(false)

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const [docTab, setDocTab] = useState<'templates' | 'drive'>('templates')

  // ── Built-in checklist card state ─────────────────────────────────────────────
  const [clCopies, setClCopies] = useState(1)
  const [wCopies,  setWCopies]  = useState(1)

  // ── Drive state ───────────────────────────────────────────────────────────────
  type DriveItem = { id: string; name: string; mimeType: string; size?: string; createdTime?: string; thumbnailLink?: string; webViewLink?: string }
  const [driveConnected,  setDriveConnected]  = useState(false)
  const [driveItems,      setDriveItems]      = useState<DriveItem[]>([])
  const [driveLoading,    setDriveLoading]    = useState(false)
  const [driveUploading,  setDriveUploading]  = useState(false)
  const [driveDeletingId, setDriveDeletingId] = useState<string|null>(null)
  // folder navigation: stack of {id, name}
  const [folderStack,     setFolderStack]     = useState<{id:string;name:string}[]>([])
  const rootDocsFolderId  = useRef<string>('')   // id of מסמכים folder
  const [newFolderMode,   setNewFolderMode]   = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [creatingFolder,  setCreatingFolder]  = useState(false)

  // Per-form copies + menu state
  const [copiesMap, setCopiesMap] = useState<Record<string, number>>({})
  const [menuOpen,  setMenuOpen]  = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const { data } = await sb
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .eq('type', 'form_template')
      .order('created_at', { ascending: true })
    setForms((data ?? []) as FormDoc[])
    setLoading(false)
  }, [sb])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      tenantId.current = profile.tenant_id
      const { data: tenant } = await sb.from('tenants').select('name, sub_title, phone, address, license_number, logo_base64').eq('id', profile.tenant_id).single()
      if (tenant) {
        bizName.current     = tenant.name            || ''
        bizSubTitle.current = tenant.sub_title       || ''
        bizPhone.current    = tenant.phone           || ''
        bizAddress.current  = tenant.address         || ''
        bizLicense.current  = tenant.license_number  || ''
        logoBase64.current  = tenant.logo_base64     || ''
      }
      fetch(`/api/drive/status?tenant_id=${profile.tenant_id}`)
        .then(r => r.json()).then(d => setDriveConnected(d.connected)).catch(() => {})
      await fetchAll()
    }
    init()
  }, [sb, fetchAll])

  // ── Drive file helpers ────────────────────────────────────────────────────────

  const currentFolderId = useCallback(() => {
    return folderStack.length > 0
      ? folderStack[folderStack.length - 1].id
      : rootDocsFolderId.current
  }, [folderStack])

  const loadDriveFiles = useCallback(async (folderId?: string) => {
    if (!tenantId.current) return
    setDriveLoading(true)
    try {
      const id = folderId ?? (folderStack.length > 0 ? folderStack[folderStack.length - 1].id : '')
      const url = id
        ? `/api/drive/files?tenant_id=${tenantId.current}&folder_id=${id}`
        : `/api/drive/files?tenant_id=${tenantId.current}&sub_folder=מסמכים`
      const res  = await fetch(url)
      const data = await res.json()
      if (!id && data.folderId) rootDocsFolderId.current = data.folderId
      setDriveItems(data.files ?? [])
    } catch { /* ignore */ }
    setDriveLoading(false)
  }, [folderStack])

  const navigateInto = (item: {id:string;name:string}) => {
    setFolderStack(p => [...p, item])
    loadDriveFiles(item.id)
  }

  const navigateBack = () => {
    const newStack = folderStack.slice(0, -1)
    setFolderStack(newStack)
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : rootDocsFolderId.current
    loadDriveFiles(parentId)
  }

  const uploadDriveFile = async (file: File) => {
    if (!tenantId.current) return
    setDriveUploading(true)
    try {
      const targetId = currentFolderId() || rootDocsFolderId.current
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tenant_id', tenantId.current)
      if (targetId) {
        // upload directly to folder id via a custom field
        fd.append('folder_id', targetId)
      } else {
        fd.append('sub_folder', 'מסמכים')
      }
      const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      showToast('הקובץ הועלה ✓', 'success')
      loadDriveFiles()
    } catch { showToast('שגיאה בהעלאה', 'error') }
    setDriveUploading(false)
  }

  const deleteDriveFile = async (fileId: string, fileName: string) => {
    const ok = await confirm({ msg: `למחוק את "${fileName}" מהדרייב?`, variant: 'danger' })
    if (!ok) return
    setDriveDeletingId(fileId)
    try {
      await fetch('/api/drive/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId.current, file_id: fileId }),
      })
      showToast('נמחק', 'success')
      setDriveItems(p => p.filter(f => f.id !== fileId))
    } catch { showToast('שגיאה במחיקה', 'error') }
    setDriveDeletingId(null)
  }

  const createDriveFolder = async () => {
    if (!newFolderName.trim() || !tenantId.current) return
    setCreatingFolder(true)
    const parentId = currentFolderId() || rootDocsFolderId.current
    try {
      const res = await fetch('/api/drive/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId.current, parent_id: parentId, name: newFolderName.trim() }),
      })
      if (!res.ok) throw new Error()
      showToast('תיקיה נוצרה ✓', 'success')
      setNewFolderName('')
      setNewFolderMode(false)
      loadDriveFiles()
    } catch { showToast('שגיאה ביצירת תיקיה', 'error') }
    setCreatingFolder(false)
  }

  // ── Template CRUD ─────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditId(null)
    setMeta(emptyForm)
    setColumns([{ label: '', width: 'medium' }])
    setFormOpen(true)
  }

  const openEdit = (f: FormDoc) => {
    setEditId(f.id)
    setMeta({
      name:             f.name,
      icon:             f.icon || '📋',
      headerExtra:      f.content.headerExtra      ?? '',
      headerAlign:      f.content.headerAlign       ?? 'right',
      headerLine:       f.content.headerLine        ?? false,
      headerLineLength: f.content.headerLineLength  ?? 'medium',
      footerText:       f.content.footerText        ?? '',
    })
    setColumns(f.content.columns?.length ? f.content.columns : [{ label: '', width: 'medium' }])
    setFormOpen(true)
  }

  const saveTemplate = async () => {
    if (!meta.name.trim()) { showToast('הכנס שם לתבנית', 'error'); return }
    const cols = columns.filter(c => c.label.trim())
    if (!cols.length) { showToast('הוסף לפחות עמודה אחת', 'error'); return }
    setSaving(true)
    const payload = {
      name: meta.name.trim(),
      icon: meta.icon || '📋',
      type: 'form_template',
      content: {
        columns:          cols,
        headerExtra:      meta.headerExtra.trim(),
        headerAlign:      meta.headerAlign,
        headerLine:       meta.headerLine,
        headerLineLength: meta.headerLineLength,
        footerText:       meta.footerText.trim(),
      },
    }
    if (editId) {
      await sb.from('documents').update(payload).eq('id', editId)
      showToast('תבנית עודכנה ✓', 'success')
    } else {
      await sb.from('documents').insert({ ...payload, tenant_id: tenantId.current })
      showToast('תבנית נשמרה ✓', 'success')
    }
    setSaving(false)
    setFormOpen(false)
    fetchAll()
  }

  const duplicateTemplate = async (f: FormDoc) => {
    await sb.from('documents').insert({
      tenant_id: tenantId.current,
      name:      f.name + ' (עותק)',
      icon:      f.icon,
      type:      'form_template',
      content:   f.content,
    })
    showToast('תבנית שוכפלה ✓', 'success')
    fetchAll()
  }

  const deleteTemplate = async (f: FormDoc) => {
    const ok = await confirm({ msg: `למחוק את התבנית "${f.name}"?`, variant: 'danger' })
    if (!ok) return
    await sb.from('documents').delete().eq('id', f.id)
    showToast('תבנית נמחקה')
    fetchAll()
  }

  // ── Column helpers ────────────────────────────────────────────────────────────

  const setColLabel = (i: number, label: string) =>
    setColumns(p => p.map((c, idx) => idx === i ? { ...c, label } : c))

  const setColWidth = (i: number, width: FormColumn['width']) =>
    setColumns(p => p.map((c, idx) => idx === i ? { ...c, width } : c))

  const removeCol = (i: number) => {
    if (columns.length <= 1) { showToast('חובה לפחות עמודה אחת', 'error'); return }
    setColumns(p => p.filter((_, idx) => idx !== i))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-muted)' }}>
      טוען...
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📄 מסמכים</h2>
        {docTab === 'templates'
          ? <Button variant="primary" onClick={openAdd}>➕ תבנית חדשה</Button>
          : driveConnected && (
            <>
              <input type="file" id="doc-drive-upload" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadDriveFile(f); e.target.value = '' }}
              />
              <label htmlFor="doc-drive-upload" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--primary)', color: '#fff', borderRadius: 8,
                padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: driveUploading ? 'default' : 'pointer',
                opacity: driveUploading ? 0.7 : 1,
              }}>
                {driveUploading ? '⏳ מעלה...' : '📤 העלה קובץ'}
              </label>
            </>
          )
        }
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {([
          ['templates', '📄 תבניות הדפסה'],
          ['drive',     '📂 קבצים בדרייב'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setDocTab(key); if (key === 'drive') { setFolderStack([]); loadDriveFiles('') } }}
            style={{
              padding: '9px 22px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
              color: docTab === key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: docTab === key ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2, transition: 'all .15s',
            }}
          >{label}</button>
        ))}
      </div>

      {/* ── Drive files tab ── */}
      {docTab === 'drive' && (
        <div>
          {!driveConnected ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☁️</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Google Drive לא מחובר</div>
              <a href="/settings" style={{ color: 'var(--primary)', fontSize: 13 }}>חבר מהגדרות ←</a>
            </div>
          ) : (
            <>
              {/* Breadcrumb + actions bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {/* Back button */}
                {folderStack.length > 0 && (
                  <button onClick={navigateBack} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    ← חזור
                  </button>
                )}
                {/* Breadcrumb path */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>מסמכים</span>
                  {folderStack.map((f, i) => (
                    <span key={f.id}>
                      <span style={{ margin: '0 2px' }}>/</span>
                      <span style={{ color: i === folderStack.length - 1 ? 'var(--text)' : 'var(--primary)', fontWeight: 600 }}>{f.name}</span>
                    </span>
                  ))}
                </div>
                {/* New folder */}
                {newFolderMode ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createDriveFolder(); if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') } }}
                      placeholder="שם תיקיה..."
                      style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: 140 }}
                    />
                    <button onClick={createDriveFolder} disabled={creatingFolder || !newFolderName.trim()} style={{ padding: '6px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {creatingFolder ? '...' : '✓'}
                    </button>
                    <button onClick={() => { setNewFolderMode(false); setNewFolderName('') }} style={{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setNewFolderMode(true)} style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    📁 תיקיה חדשה
                  </button>
                )}
              </div>

              {driveLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>טוען...</div>
              ) : driveItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                  <div style={{ fontWeight: 700 }}>תיקיה ריקה</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>העלה קובץ או צור תיקיה חדשה</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {driveItems.map(item => {
                    const isFolder = item.mimeType === 'application/vnd.google-apps.folder'
                    const isImage  = item.mimeType?.startsWith('image/')
                    const isPdf    = item.mimeType === 'application/pdf'
                    if (isFolder) return (
                      <div key={item.id}
                        onClick={() => navigateInto({ id: item.id, name: item.name })}
                        style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', padding: '18px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                      >
                        <span style={{ fontSize: 28 }}>📁</span>
                        <span style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>{item.name}</span>
                      </div>
                    )
                    return (
                      <div key={item.id} style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <a href={item.webViewLink} target="_blank" rel="noreferrer" style={{ display: 'block', height: 110, background: 'var(--bg)' }}>
                          {isImage
                            ? <img src={`https://drive.google.com/thumbnail?id=${item.id}&sz=w400`} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 40 }}>{isPdf ? '📄' : '📎'}</div>
                          }
                        </a>
                        <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3 }}>{item.name}</div>
                          {item.size && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(parseInt(item.size)/1024).toFixed(0)} KB</div>}
                          <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                            <a href={item.webViewLink} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: '4px 0', background: 'var(--bg)', borderRadius: 6, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>🔗 פתח</a>
                            <button onClick={() => deleteDriveFile(item.id, item.name)} disabled={driveDeletingId === item.id}
                              style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {driveDeletingId === item.id ? '...' : '🗑️'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Templates tab ── */}
      {docTab === 'templates' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>

        {/* ── Built-in: בדיקת רכב ── */}
        <div style={{
          background: '#fff', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)', borderRight: '5px solid var(--primary)',
          padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔍 בדיקת רכב כללית
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 99, background: '#f0fdf4', color: 'var(--primary)',
              border: '1px solid var(--primary)',
            }}>מובנה</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            צמיגים · נוזלים · פנסים · מגבים · אביזרים · שטיפה
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>עותקים:</label>
            <input
              type="number" min={1} max={10}
              value={clCopies}
              onChange={e => setClCopies(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 50, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
            />
            <Button
              variant="primary"
              style={{ marginRight: 'auto' }}
              onClick={() => printChecklist(clCopies, '', '', '', logoBase64.current)}
            >
              🖨️ הדפס
            </Button>
          </div>
        </div>

        {/* ── Built-in: תעודת אחריות ── */}
        <div style={{
          background: '#fff', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)', borderRight: '5px solid var(--primary)',
          padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 הצהרת לקוח – בדיקת רכב
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 99, background: '#f0fdf4', color: 'var(--primary)',
              border: '1px solid var(--primary)',
            }}>מובנה</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            עמוד 1 ריק למילוי ידני · הצהרה · פרטי לקוח/רכב · חתימות
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>עותקים:</label>
            <input
              type="number" min={1} max={10}
              value={wCopies}
              onChange={e => setWCopies(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 50, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
            />
            <Button
              variant="primary"
              style={{ marginRight: 'auto' }}
              onClick={() => printWarranty(wCopies, bizName.current, logoBase64.current, bizSubTitle.current, bizPhone.current, bizAddress.current, bizLicense.current)}
            >
              🖨️ הדפס
            </Button>
          </div>
        </div>

        {/* ── Custom templates ── */}
        {forms.map(f => (
          <div key={f.id} style={{
            background: '#fff', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', borderRight: '5px solid var(--accent)',
            padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Title row + 3-dot menu */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{f.icon || '📋'}</span> {f.name}
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === f.id ? null : f.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 18, color: 'var(--text-muted)', padding: '2px 6px',
                    borderRadius: 6, lineHeight: 1,
                  }}
                >⋮</button>
                {menuOpen === f.id && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0,
                    background: '#fff', borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(0,0,0,.15)',
                    border: '1px solid var(--border)',
                    zIndex: 100, minWidth: 130, overflow: 'hidden',
                  }}>
                    {[
                      { label: '✏️ עריכה',  action: () => { openEdit(f);              setMenuOpen(null) } },
                      { label: '📋 שכפול',  action: () => { duplicateTemplate(f);     setMenuOpen(null) } },
                      { label: '🗑️ מחיקה', action: () => { deleteTemplate(f);        setMenuOpen(null) }, danger: true },
                    ].map(item => (
                      <button key={item.label} onClick={item.action} style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        background: 'none', border: 'none', textAlign: 'right',
                        fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                        color: item.danger ? 'var(--danger)' : 'var(--text)',
                        borderBottom: '1px solid var(--border)',
                      }}>{item.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              {f.content.columns?.map(c => c.label).join(' · ')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {f.content.columns?.length} עמודות
              {f.content.headerExtra ? ' · ' + f.content.headerExtra : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>עותקים:</label>
              <input
                type="number" min={1} max={20}
                value={copiesMap[f.id] ?? 1}
                onChange={e => setCopiesMap(p => ({ ...p, [f.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                style={{ width: 50, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
              />
              <Button variant="primary" style={{ marginRight: 'auto' }} onClick={() => printFormTemplate(f, copiesMap[f.id] ?? 1)}>
                🖨️ הדפס
              </Button>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {forms.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
            borderRight: '5px dashed var(--border)', padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: 'var(--text-muted)', cursor: 'pointer',
          }} onClick={openAdd}>
            <div style={{ fontSize: 32 }}>➕</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>צור תבנית חדשה</div>
          </div>
        )}
      </div>}

      {/* ── Add/Edit Template Modal ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editId ? 'עריכת תבנית' : 'תבנית חדשה'}
        maxWidth={580}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button variant="primary" onClick={saveTemplate} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Icon + Name */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <label style={labelStyle}>אייקון</label>
              <input
                value={meta.icon}
                onChange={e => setMeta(p => ({ ...p, icon: e.target.value }))}
                maxLength={4}
                style={{ width: 56, padding: '7px 4px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 22, textAlign: 'center', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>שם התבנית *</label>
              <input
                value={meta.name}
                onChange={e => setMeta(p => ({ ...p, name: e.target.value }))}
                placeholder="למשל: הזמנת צמיגים"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Columns */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={labelStyle}>עמודות הטבלה</label>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>רוחב: צרה=מס׳/כמות · רחבה=שם/הערות</span>
            </div>
            {columns.map((col, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <input
                  value={col.label}
                  onChange={e => setColLabel(i, e.target.value)}
                  placeholder="שם עמודה"
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['narrow', 'medium', 'wide'] as FormColumn['width'][]).map(w => (
                    <button
                      key={w}
                      onClick={() => setColWidth(i, w)}
                      style={{
                        padding: '5px 9px', border: `1px solid ${col.width === w ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        background: col.width === w ? 'var(--accent)' : 'var(--bg)',
                        color: col.width === w ? '#fff' : 'var(--text-muted)',
                        fontWeight: col.width === w ? 700 : 400,
                      }}
                    >{WIDTH_LABEL[w]}</button>
                  ))}
                </div>
                <button
                  onClick={() => removeCol(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: '2px 4px' }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setColumns(p => [...p, { label: '', width: 'medium' }])}
              style={{
                marginTop: 10, padding: '8px', border: '2px dashed var(--border)',
                borderRadius: 8, background: 'none', width: '100%', cursor: 'pointer',
                fontSize: 13, color: 'var(--text-muted)', fontFamily: 'inherit',
              }}
            >➕ הוסף עמודה</button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          {/* Header / Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>שורת כותרת נוספת (אופציונלי)</label>
              <input
                value={meta.headerExtra}
                onChange={e => setMeta(p => ({ ...p, headerExtra: e.target.value }))}
                placeholder='לדוגמה: שם ספק:'
                style={inputStyle}
              />
              {/* Align + line options */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Align */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>מיקום:</span>
                  {(['right','center','left'] as const).map(a => (
                    <button key={a} onClick={() => setMeta(p => ({ ...p, headerAlign: a }))} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12,
                      border: `1px solid ${meta.headerAlign === a ? 'var(--accent)' : 'var(--border)'}`,
                      background: meta.headerAlign === a ? 'var(--accent)' : '#fff',
                      color: meta.headerAlign === a ? '#fff' : 'var(--text-muted)',
                      fontFamily: 'inherit', cursor: 'pointer', fontWeight: meta.headerAlign === a ? 700 : 400,
                    }}>
                      {a === 'right' ? 'ימין' : a === 'center' ? 'מרכז' : 'שמאל'}
                    </button>
                  ))}
                </div>
                {/* Line toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={meta.headerLine}
                    onChange={e => setMeta(p => ({ ...p, headerLine: e.target.checked }))}
                  />
                  קו לכתיבה
                </label>
                {/* Line length */}
                {meta.headerLine && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>אורך:</span>
                    {(['short','medium','long'] as const).map(l => (
                      <button key={l} onClick={() => setMeta(p => ({ ...p, headerLineLength: l }))} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12,
                        border: `1px solid ${meta.headerLineLength === l ? 'var(--accent)' : 'var(--border)'}`,
                        background: meta.headerLineLength === l ? 'var(--accent)' : '#fff',
                        color: meta.headerLineLength === l ? '#fff' : 'var(--text-muted)',
                        fontFamily: 'inherit', cursor: 'pointer', fontWeight: meta.headerLineLength === l ? 700 : 400,
                      }}>
                        {l === 'short' ? 'קצר' : l === 'medium' ? 'בינוני' : 'ארוך'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={labelStyle}>שורת תחתית (אופציונלי)</label>
              <input
                value={meta.footerText}
                onChange={e => setMeta(p => ({ ...p, footerText: e.target.value }))}
                placeholder='חתימה: _______'
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1.5px solid var(--border)', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
}
