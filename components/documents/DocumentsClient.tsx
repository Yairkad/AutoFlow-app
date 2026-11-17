'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MoreMenu from '@/components/ui/MoreMenu'
import FreeDocEditor, { printFreeDoc, type FreeDocContent, type BizHeader } from '@/components/documents/FreeDocEditor'

interface FreeDocRow { id: string; name: string; content: FreeDocContent | null; created_at: string }
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import PageHeader from '@/components/ui/PageHeader'
import CarContractsPanel from '@/components/cars/CarContractsPanel'
import PowerOfAttorneyPanel from '@/components/documents/PowerOfAttorneyPanel'
import { printHtml } from '@/lib/print/printHtml'

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

interface HtmlDoc {
  id: string
  tenant_id: string
  name: string
  icon: string
  type: 'html_template'
  content: { html: string }
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const emptyForm = {
  name: '', icon: '📋',
  headerExtra: '', headerAlign: 'right' as const,
  headerLine: false, headerLineLength: 'medium' as const,
  footerText: '',
}

// One gallery of every form; contracts / power of attorney / the editor open as their own view
type DocView = 'gallery' | 'editor' | 'contracts' | 'poa'
type GalleryFilter = 'all' | 'builtin' | 'mine' | 'templates'

const emptyCol: FormColumn = { label: '', width: 'medium' }

const WIDTH_LABEL: Record<string, string>  = { narrow: 'צרה', medium: 'בינונית', wide: 'רחבה' }
const WIDTH_WEIGHT: Record<string, number> = { narrow: 1, medium: 2, wide: 3 }

// ── Template variable replacement ──────────────────────────────────────────────

function replaceTemplateVars(html: string, vars: {
  logo: string; bizName: string; bizSubTitle: string
  bizPhone: string; bizAddress: string; bizLicense: string
}) {
  const logoTag = vars.logo
    ? `<img src="${vars.logo}" style="max-height:80px;max-width:200px;object-fit:contain;display:block">`
    : ''
  return html
    .replace(/\{\{logo\}\}/g,        logoTag)
    .replace(/\{\{bizName\}\}/g,     vars.bizName)
    .replace(/\{\{bizSubTitle\}\}/g, vars.bizSubTitle)
    .replace(/\{\{bizPhone\}\}/g,    vars.bizPhone)
    .replace(/\{\{bizAddress\}\}/g,  vars.bizAddress)
    .replace(/\{\{bizLicense\}\}/g,  vars.bizLicense)
}

// ── Merge business banner into an uploaded/pasted HTML doc ─────────────────────
// Same header info as printBlankHeader, injected at the top of <body>; the
// original content is wrapped and slightly shrunk so it still fits under it.

function mergeBannerIntoHtml(rawHtml: string, biz: {
  bizName: string; bizSubTitle: string; bizPhone: string
  bizAddress: string; bizLicense: string; logoBase64: string
}): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const body = doc.body
  if (!body) return rawHtml

  const logoHTML = biz.logoBase64
    ? `<img src="${biz.logoBase64}" class="af-banner-logo" alt="לוגו"/>`
    : ''

  const bannerWrap = doc.createElement('div')
  bannerWrap.innerHTML = `
    <div class="af-banner">
      <div class="af-banner-biz">
        <div class="af-banner-name">${biz.bizName}</div>
        ${biz.bizSubTitle ? `<div class="af-banner-sub">${biz.bizSubTitle}</div>` : ''}
        ${biz.bizAddress  ? `<div>${biz.bizAddress}</div>`   : ''}
        ${biz.bizPhone    ? `<div>טל׳: ${biz.bizPhone}</div>` : ''}
        ${biz.bizLicense  ? `<div>מס׳ רישיון מוסך: ${biz.bizLicense}</div>` : ''}
      </div>
      <div class="af-banner-logo-wrap">${logoHTML}</div>
    </div>`.trim()
  const bannerEl = bannerWrap.firstElementChild

  const style = doc.createElement('style')
  style.textContent = `
    .af-banner { display:flex; align-items:center; justify-content:space-between; gap:16px;
      padding:8px 14px; margin-bottom:8px; border-bottom:2px solid #000;
      font-family:'Heebo',Arial,sans-serif; direction:rtl; background:#fff; }
    .af-banner-biz { font-weight:bold; font-size:11px; line-height:1.4; color:#000; }
    .af-banner-name { font-size:14px; font-weight:900; }
    .af-banner-sub { font-size:10px; }
    .af-banner-logo { max-height:60px; max-width:140px; object-fit:contain; display:block; }
    .af-banner-content { transform-origin:top center; zoom:0.9; }
  `
  doc.head.appendChild(style)

  const contentWrap = doc.createElement('div')
  contentWrap.className = 'af-banner-content'
  while (body.firstChild) contentWrap.appendChild(body.firstChild)

  if (bannerEl) body.appendChild(bannerEl)
  body.appendChild(contentWrap)

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}

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
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:15mm; }
    body { font-family:'Heebo',Arial,sans-serif; direction:rtl; background:#fff; }
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
  <script>window.onload=function(){window.onafterprint=function(){window.close()};window.print()}<\/script>
</body></html>`

  printHtml(html)
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
  <script>window.onload=function(){window.onafterprint=function(){window.close()};window.print()}<\/script>
</body></html>`

  printHtml(html)
}

// ── printBlankHeader ──────────────────────────────────────────────────────────
// Blank page: just logo + business details header, rest is empty

function printBlankHeader(copies: number, bizNameStr: string, logoBase64: string, subTitle: string, phone: string, address: string, license: string) {
  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" class="pp-logo-img" alt="לוגו"/>`
    : ''
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
  </div>`
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
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
    .pp-logo-img { max-height:110px; max-width:240px; object-fit:contain; display:block; margin:0 auto; }
    .pp-logo-svc { font-size:9px; text-align:center; font-weight:bold; margin-top:4px; letter-spacing:0.5px; color:#333; }
  </style></head><body>
  ${Array(copies).fill(pageHTML).join('\n')}
  <script>window.onload=function(){window.onafterprint=function(){window.close()};window.print()}<\/script>
  </body></html>`
  printHtml(html)
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
        <h4>חשוב ביותר!!!</h4>
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
    .pp-logo-img { max-height:110px; max-width:240px; object-fit:contain; display:block; margin:0 auto; }
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
  <script>window.onload=function(){window.onafterprint=function(){window.close()};window.print()}<\/script>
</body></html>`

  printHtml(html)
}

function printSellerWaiver(bizNameStr: string, logoBase64: string, subTitle: string, phone: string, address: string, license: string) {
  const logoHTML = logoBase64
    ? `<img src="${logoBase64}" class="pp-logo-img" alt="לוגו"/>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>הסרת אחריות מוכר</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Heebo',Arial,sans-serif; direction:rtl; background:#e5e7eb; }

    /* ══ SCREEN — נוח למילוי ══ */
    .wrap { max-width:740px; margin:0 auto; padding:30px 20px; display:flex; flex-direction:column; gap:20px; }
    .pp-bsd { text-align:right; font-weight:bold; font-size:12px; }
    .pp-hdr { display:flex; justify-content:space-between; align-items:center; padding-bottom:16px; border-bottom:2px solid #000; }
    .pp-biz { font-weight:bold; font-size:14px; line-height:1.6; }
    .pp-biz-name { font-size:20px; font-weight:900; }
    .pp-logo-wrap { text-align:center; }
    .pp-logo-img { max-height:110px; max-width:220px; object-fit:contain; display:block; margin:0 auto; }
    .pp-logo-svc { font-size:10px; font-weight:bold; margin-top:5px; color:#444; letter-spacing:0.5px; }
    .doc-title { text-align:center; font-size:20px; font-weight:900; border-bottom:2.5px solid #1a56db; padding-bottom:10px; }
    .two-cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .sec { background:#fff; border:1px solid #d0d7e3; border-radius:10px; padding:16px 18px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .sec-title { font-size:13px; font-weight:700; color:#1a56db; margin-bottom:12px; }
    .row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
    .field { display:flex; flex-direction:column; gap:5px; }
    label { font-size:12px; font-weight:600; color:#555; }
    input { padding:9px 12px; border:1.5px solid #ccc; border-radius:7px; font-size:15px; font-family:inherit; background:#fafafa; width:100%; transition:border-color .15s; }
    input:focus { outline:none; border-color:#1a56db; background:#fff; }
    .decl { background:#fff; border:1px solid #d0d7e3; border-radius:10px; padding:16px 18px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .decl-title { font-size:13px; font-weight:700; color:#1a56db; margin-bottom:10px; }
    .decl ul { padding-right:18px; font-size:14px; line-height:1.8; color:#222; text-align:justify; }
    .decl li { margin-bottom:6px; }
    .sigs { display:flex; justify-content:space-around; padding-top:16px; border-top:1px solid #ddd; }
    .sig-box { text-align:center; width:38%; font-size:14px; font-weight:600; }
    .sig-line { margin-top:40px; border-top:1.5px solid #333; }
    .print-btn { display:block; width:200px; margin:0 auto; padding:12px; background:#1a56db; color:#fff; border:none; border-radius:8px; font-size:16px; font-weight:700; cursor:pointer; font-family:inherit; }
    .print-btn:hover { background:#1e40af; }

    /* ══ PRINT — עמוד A4 אחד ══ */
    @page { size:A4 portrait; margin:10mm 12mm; }
    @media print {
      body { background:#fff; }
      .wrap { max-width:100%; padding:0; gap:5mm; }
      .pp-bsd { font-size:10px; }
      .pp-hdr { padding-bottom:4mm; margin-bottom:0; }
      .pp-biz { font-size:11px; }
      .pp-biz-name { font-size:15px; }
      .pp-logo-img { max-height:80px; max-width:160px; }
      .pp-logo-svc { font-size:8px; }
      .doc-title { font-size:15px; padding-bottom:3mm; }
      .two-cols { gap:4mm; }
      .sec { padding:3mm 4mm; border-radius:5px; box-shadow:none; background:none; border-color:#bbb; }
      .sec-title { font-size:10px; margin-bottom:2mm; }
      .row-3 { gap:3mm; }
      label { font-size:9px; }
      input { padding:2px 5px; font-size:11px; border:none; border-bottom:1px dashed #555; border-radius:0; background:transparent; }
      .decl { padding:3mm 4mm; border-radius:5px; box-shadow:none; background:none; border-color:#bbb; }
      .decl-title { font-size:10px; margin-bottom:2mm; }
      .decl ul { font-size:10px; line-height:1.6; }
      .decl li { margin-bottom:1.5mm; }
      .sigs { padding-top:4mm; }
      .sig-box { font-size:11px; }
      .sig-line { margin-top:12mm; }
      .print-btn { display:none; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="pp-bsd">בס"ד</div>

  <div class="pp-hdr">
    <div class="pp-biz">
      <div class="pp-biz-name">${bizNameStr}</div>
      ${subTitle ? `<div style="font-size:13px">${subTitle}</div>` : ''}
      ${address  ? `<div>${address}</div>`    : ''}
      ${phone    ? `<div>טל׳: ${phone}</div>` : ''}
      ${license  ? `<div>מס׳ רישיון מוסך: ${license}</div>` : ''}
    </div>
    <div class="pp-logo-wrap">
      ${logoHTML}
      <div class="pp-logo-svc">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
    </div>
  </div>

  <div class="doc-title">טופס הסרת אחריות מוכר בעת קניית רכב</div>

  <div class="two-cols">
    <div class="sec">
      <div class="sec-title">מועד מסירת הרכב</div>
      <div class="field">
        <label>תאריך ושעה מדויקים של העברת החזקה:</label>
        <input type="datetime-local">
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">פרטי הרכב</div>
      <div class="row-3">
        <div class="field"><label>יצרן ודגם:</label><input type="text" placeholder="מאזדה 3"></div>
        <div class="field"><label>שנת ייצור:</label><input type="text"></div>
        <div class="field"><label>מספר רישוי:</label><input type="text" placeholder="00-000-00"></div>
      </div>
    </div>
  </div>

  <div class="two-cols">
    <div class="sec">
      <div class="sec-title">פרטי המוכר</div>
      <div class="row-3">
        <div class="field"><label>שם מלא:</label><input type="text"></div>
        <div class="field"><label>ת.ז.:</label><input type="text" maxlength="9"></div>
        <div class="field"><label>טלפון:</label><input type="tel"></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">פרטי הקונה</div>
      <div class="row-3">
        <div class="field"><label>שם מלא:</label><input type="text"></div>
        <div class="field"><label>ת.ז.:</label><input type="text" maxlength="9"></div>
        <div class="field"><label>טלפון:</label><input type="tel"></div>
      </div>
    </div>
  </div>

  <div class="decl">
    <div class="decl-title">הצהרת הקונה ונטילת אחריות</div>
    <ul>
      <li>הקונה מאשר כי בתאריך ובשעה המצוינים לעיל קיבל לידיו את החזקה הבלעדית ברכב, לרבות מפתחות הרכב ומסמכיו.</li>
      <li>הקונה מתחייב כי החל ממועד המסירה, הוא ורק הוא יישא בכל אחריות (אזרחית, פלילית, תעבורתית או אחרת) בקשר עם השימוש ברכב, החזקתו או נהיגתו.</li>
      <li>הקונה מתחייב לשאת בכל הדוחות, הקנסות, אגרות כבישי האגרה (כביש 6, הנתיב המהיר), צילומי מהירות, דוחות חניה וכל חיוב אחר החל משעת המסירה ואילך.</li>
      <li>אם יגיע למוכר חיוב המתייחס לתקופה שלאחר המסירה — הקונה מתחייב להסב את הדוח/החיוב על שמו ולשפות את המוכר בגין כל הוצאה שתיגרם לו.</li>
      <li>הצדדים מתחייבים להשלים את העברת הבעלות הרשמית במשרד הרישוי בהקדם האפשרי.</li>
    </ul>
  </div>

  <div class="sigs">
    <div class="sig-box">חתימת המוכר<div class="sig-line"></div></div>
    <div class="sig-box">חתימת הקונה<div class="sig-line"></div></div>
  </div>

  <button class="print-btn" onclick="window.print()">הדפסה / PDF</button>
</div>
<script>document.querySelector('input')?.focus()<\/script>
</body>
</html>`

  // Fillable form (inputs) — the buyer/seller details are typed in this window before printing
  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocumentsClient() {
  const sb         = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantId   = useRef<string>('')
  const bizName    = useRef<string>('')
  const bizSubTitle    = useRef<string>('')
  const bizPhone       = useRef<string>('')
  const bizAddress     = useRef<string>('')
  const bizLicense     = useRef<string>('')
  const logoBase64 = useRef<string>('')
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [forms,     setForms]     = useState<FormDoc[]>([])
  const [htmlForms, setHtmlForms] = useState<HtmlDoc[]>([])
  const [loading,   setLoading]   = useState(true)
  const htmlUploadRef = useRef<HTMLInputElement>(null)

  // ── Paste HTML modal ──────────────────────────────────────────────────────────
  const [htmlPasteOpen,   setHtmlPasteOpen]   = useState(false)
  const [htmlPasteName,   setHtmlPasteName]   = useState('')
  const [htmlPasteCode,   setHtmlPasteCode]   = useState('')
  const [htmlPasteSaving, setHtmlPasteSaving] = useState(false)

  const savePastedHtml = async () => {
    if (!htmlPasteCode.trim()) { showToast('הדבק קוד HTML', 'error'); return }
    setHtmlPasteSaving(true)
    await saveHtmlTemplate(htmlPasteName.trim() || 'מסמך HTML', htmlPasteCode)
    setHtmlPasteSaving(false)
    setHtmlPasteOpen(false)
    setHtmlPasteName('')
    setHtmlPasteCode('')
  }

  // ── Template modal ────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [meta,     setMeta]     = useState<{ name: string; icon: string; headerExtra: string; headerAlign: 'right' | 'center' | 'left'; headerLine: boolean; headerLineLength: 'short' | 'medium' | 'long'; footerText: string }>(emptyForm)
  const [columns,  setColumns]  = useState<FormColumn[]>([{ ...emptyCol }])
  const [saving,   setSaving]   = useState(false)

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const [view, setView]       = useState<DocView>('gallery')
  const [gFilter, setGFilter] = useState<GalleryFilter>('all')
  const [gSearch, setGSearch] = useState('')
  // Print dialog for tiles that print N copies
  const [printAsk, setPrintAsk] = useState<{ title: string; run: (copies: number) => void } | null>(null)
  const [askCopies, setAskCopies] = useState(1)
  // Built-in forms the business hid (kept in a 'doc_prefs' documents row — no extra table)
  const [prefs, setPrefs] = useState<{ id: string | null; hidden: string[] }>({ id: null, hidden: [] })
  // Free documents (type 'free_doc') and the one open in the editor (id null = not saved yet)
  const [freeDocs, setFreeDocs] = useState<FreeDocRow[]>([])
  const [freeEdit, setFreeEdit] = useState<{ id: string | null; name: string; content: FreeDocContent | null } | null>(null)
  const [biz, setBiz] = useState<BizHeader>({ name: '', sub: '', phone: '', address: '', logo: '' })

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const { data } = await sb
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .in('type', ['form_template', 'html_template', 'free_doc', 'doc_prefs'])
      .order('created_at', { ascending: true })
    const all = data ?? []
    setForms(all.filter(d => d.type === 'form_template') as FormDoc[])
    setHtmlForms(all.filter(d => d.type === 'html_template') as HtmlDoc[])
    setFreeDocs(all.filter(d => d.type === 'free_doc') as FreeDocRow[])
    const pr = all.find(d => d.type === 'doc_prefs')
    setPrefs({ id: pr?.id ?? null, hidden: (pr?.content as { hidden?: string[] } | null)?.hidden ?? [] })
    setLoading(false)
  }, [sb])

  useEffect(() => {
    if (!profile) return
    const init = async () => {
      tenantId.current = profile.tenantId
      const tenant = profile.tenant
      if (tenant) {
        bizName.current     = (tenant.name as string)            || ''
        bizSubTitle.current = (tenant.sub_title as string)       || ''
        bizPhone.current    = (tenant.phone as string)           || ''
        bizAddress.current  = (tenant.address as string)         || ''
        bizLicense.current  = (tenant.license_number as string)  || ''
        logoBase64.current  = (tenant.logo_base64 as string)     || ''
        setBiz({ name: bizName.current, sub: bizSubTitle.current, phone: bizPhone.current, address: bizAddress.current, logo: logoBase64.current, license: bizLicense.current })
      }
      await fetchAll()
    }
    init()
  }, [profile, fetchAll])

  // View is linkable: /documents?tab=poa | contracts | editor
  function openView(v: DocView) {
    setView(v)
    const url = new URL(window.location.href)
    if (v === 'gallery') url.searchParams.delete('tab'); else url.searchParams.set('tab', v)
    window.history.replaceState(null, '', url)
  }
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'poa' || t === 'contracts') { const id = setTimeout(() => setView(t), 0); return () => clearTimeout(id) }
  }, [])

  async function setHidden(key: string, hide: boolean) {
    const hidden = hide ? [...new Set([...prefs.hidden, key])] : prefs.hidden.filter(k => k !== key)
    const { data, error } = prefs.id
      ? await sb.from('documents').update({ content: { hidden } }).eq('id', prefs.id).select('id').single()
      : await sb.from('documents').insert({ tenant_id: tenantId.current, name: 'הגדרות טפסים', type: 'doc_prefs', content: { hidden } }).select('id').single()
    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    setPrefs({ id: data.id, hidden })
    showToast(hide ? 'הטופס הוסר מהרשימה' : 'הטופס הוחזר', 'success')
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

  // ── HTML template helpers ─────────────────────────────────────────────────────

  const saveHtmlTemplate = async (name: string, rawHtml: string) => {
    const merged = mergeBannerIntoHtml(rawHtml, {
      bizName:     bizName.current,
      bizSubTitle: bizSubTitle.current,
      bizPhone:    bizPhone.current,
      bizAddress:  bizAddress.current,
      bizLicense:  bizLicense.current,
      logoBase64:  logoBase64.current,
    })
    await sb.from('documents').insert({
      tenant_id: tenantId.current,
      name,
      icon: '🎨',
      type: 'html_template',
      content: { html: merged },
    })
    showToast('מסמך HTML נשמר ✓', 'success')
    fetchAll()
  }

  const uploadHtmlTemplate = async (file: File) => {
    const text = await file.text()
    const name = file.name.replace(/\.html?$/i, '')
    await saveHtmlTemplate(name, text)
  }

  const printHtmlDoc = (doc: HtmlDoc) => {
    const html = replaceTemplateVars(doc.content.html, {
      logo:       logoBase64.current,
      bizName:    bizName.current,
      bizSubTitle: bizSubTitle.current,
      bizPhone:   bizPhone.current,
      bizAddress: bizAddress.current,
      bizLicense: bizLicense.current,
    })
    printHtml(html)
  }

  const deleteHtmlTemplate = async (doc: HtmlDoc) => {
    const ok = await confirm({ msg: `למחוק את "${doc.name}"?`, variant: 'danger' })
    if (!ok) return
    await sb.from('documents').delete().eq('id', doc.id)
    showToast('מסמך נמחק')
    fetchAll()
  }

  const renameHtmlTemplate = async (doc: HtmlDoc) => {
    const newName = window.prompt('שם חדש למסמך:', doc.name)
    if (!newName || newName.trim() === doc.name) return
    await sb.from('documents').update({ name: newName.trim() }).eq('id', doc.id)
    showToast('שם עודכן ✓', 'success')
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

  // ── Gallery items: built-in forms + the business's own templates and documents ──
  type Tile = {
    key: string; group: Exclude<GalleryFilter, 'all'>; kind: string; icon: string; title: string; sub: string
    open: () => void; actions?: { key: string; label: string; icon: string; danger?: boolean; onClick: () => void }[]
  }
  const ask = (title: string, run: (copies: number) => void) => { setAskCopies(1); setPrintAsk({ title, run }) }
  const B = () => [biz.name, biz.logo, biz.sub, biz.phone, biz.address, biz.license ?? ''] as const
  const builtins: Tile[] = [
    { key: 'b:contracts', group: 'builtin', kind: 'חוזים', icon: '📝', title: 'חוזה מכירת רכב', sub: 'חוזים לפי רכב — טיוטות וחתומים', open: () => openView('contracts') },
    { key: 'b:poa', group: 'builtin', kind: 'משרד התחבורה', icon: '✍️', title: 'ייפוי כוח', sub: 'טופס משרד התחבורה למילוי והדפסה', open: () => openView('poa') },
    { key: 'b:checklist', group: 'builtin', kind: 'טופס', icon: '🔍', title: 'בדיקת רכב כללית', sub: 'צמיגים · נוזלים · פנסים · מגבים · אביזרים', open: () => ask('בדיקת רכב כללית', n => printChecklist(n, '', '', '', biz.logo)) },
    { key: 'b:warranty', group: 'builtin', kind: 'טופס', icon: '📋', title: 'הצהרת לקוח – בדיקת רכב', sub: 'הצהרה · פרטי לקוח ורכב · חתימות', open: () => ask('הצהרת לקוח – בדיקת רכב', n => printWarranty(n, ...B())) },
    { key: 'b:blank', group: 'builtin', kind: 'טופס', icon: '📄', title: 'דף כותרת ריק', sub: 'לוגו ופרטי העסק + שטח לכתיבה', open: () => ask('דף כותרת ריק', n => printBlankHeader(n, ...B())) },
    { key: 'b:waiver', group: 'builtin', kind: 'טופס', icon: '🤝', title: 'הסרת אחריות מוכר', sub: 'פרטי רכב · מוכר · קונה · חתימות', open: () => printSellerWaiver(...B()) },
  ]
  const hiddenBuiltins = builtins.filter(t => prefs.hidden.includes(t.key))
  const tiles: Tile[] = [
    ...builtins.filter(t => !prefs.hidden.includes(t.key)).map(t => ({
      ...t, actions: [{ key: 'hide', label: 'הסר מהרשימה', icon: '🗑️', danger: true, onClick: () => setHidden(t.key, true) }],
    })),
    ...freeDocs.map(d => ({
      key: `f:${d.id}`, group: 'mine' as const, kind: 'מסמך', icon: '📝', title: d.name,
      sub: `${(d.content?.boxes ?? []).length} תיבות · ${new Date(d.created_at).toLocaleDateString('he-IL')}`,
      open: () => { setFreeEdit({ id: d.id, name: d.name, content: d.content }); setView('editor') },
      actions: [
        { key: 'print', label: 'הדפסה', icon: '🖨', onClick: () => printFreeDoc(d.name, d.content ?? { boxes: [], letterhead: true }, biz) },
        { key: 'dup', label: 'שכפול', icon: '📋', onClick: async () => {
          await sb.from('documents').insert({ tenant_id: tenantId.current, name: `${d.name} (עותק)`, type: 'free_doc', icon: '📝', content: d.content })
          fetchAll()
        } },
        { key: 'del', label: 'מחיקה', icon: '🗑️', danger: true, onClick: async () => {
          if (!(await confirm({ msg: `למחוק את "${d.name}"?` }))) return
          await sb.from('documents').delete().eq('id', d.id)
          fetchAll()
        } },
      ],
    })),
    ...forms.map(f => ({
      key: `t:${f.id}`, group: 'templates' as const, kind: 'טבלה', icon: f.icon || '📋', title: f.name,
      sub: f.content.columns?.map(c => c.label).filter(Boolean).join(' · ') || `${f.content.columns?.length ?? 0} עמודות`,
      open: () => ask(f.name, n => printFormTemplate(f, n)),
      actions: [
        { key: 'edit', label: 'עריכה', icon: '✏️', onClick: () => openEdit(f) },
        { key: 'dup', label: 'שכפול', icon: '📋', onClick: () => duplicateTemplate(f) },
        { key: 'delete', label: 'מחיקה', icon: '🗑️', danger: true, onClick: () => deleteTemplate(f) },
      ],
    })),
    ...htmlForms.map(doc => ({
      key: `h:${doc.id}`, group: 'templates' as const, kind: 'עיצוב אישי', icon: doc.icon || '🎨', title: doc.name, sub: 'מסמך HTML',
      open: () => printHtmlDoc(doc),
      actions: [
        { key: 'rename', label: 'שינוי שם', icon: '✏️', onClick: () => renameHtmlTemplate(doc) },
        { key: 'delete', label: 'מחיקה', icon: '🗑️', danger: true, onClick: () => deleteHtmlTemplate(doc) },
      ],
    })),
  ]
  const shownTiles = tiles.filter(t =>
    (gFilter === 'all' || t.group === gFilter) &&
    (!gSearch.trim() || `${t.title} ${t.sub} ${t.kind}`.includes(gSearch.trim())))

  const backBar = (title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button type="button" onClick={() => { setFreeEdit(null); openView('gallery') }} className="doc-back">→ כל הטפסים</button>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h2>
    </div>
  )

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        title="טפסים"
        subtitle="כל הטפסים, החוזים והמסמכים של העסק במקום אחד"
        actions={view === 'gallery' ? <>
          <input ref={htmlUploadRef} id="doc-html-upload" aria-label="העלאת קובץ HTML" type="file" accept=".html,.htm" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) uploadHtmlTemplate(e.target.files[0]); e.currentTarget.value = '' }} />
          <MoreMenu label="+ חדש ▾" actions={[
            { key: 'free', label: 'מסמך חופשי (על נייר העסק)', icon: '📝', onClick: () => { setFreeEdit({ id: null, name: 'מסמך חדש', content: null }); openView('editor') } },
            { key: 'table', label: 'טופס טבלה להדפסה', icon: '📋', onClick: openAdd },
            { key: 'contract', label: 'חוזה מכירת רכב', icon: '🚗', onClick: () => openView('contracts') },
            { key: 'upload', label: 'העלאת קובץ HTML', icon: '📤', onClick: () => document.getElementById('doc-html-upload')?.click() },
            { key: 'paste', label: 'הדבקת קוד HTML', icon: '📋', onClick: () => setHtmlPasteOpen(true) },
          ]} />
        </> : undefined}
      />

      {view === 'contracts' && <>{backBar('חוזה מכירת רכב')}<CarContractsPanel /></>}
      {view === 'poa' && <>{backBar('ייפוי כוח')}<PowerOfAttorneyPanel /></>}

      {/* ── Free document editor: blank page + text boxes ── */}
      {view === 'editor' && freeEdit && (
        <FreeDocEditor
          key={freeEdit.id ?? 'new'}
          initialName={freeEdit.name}
          initialContent={freeEdit.content}
          biz={biz}
          onClose={() => { setFreeEdit(null); openView('gallery') }}
          onSave={async (name, content) => {
            const { data, error } = freeEdit.id
              ? await sb.from('documents').update({ name, content }).eq('id', freeEdit.id).select('id').single()
              : await sb.from('documents').insert({ tenant_id: tenantId.current, name, type: 'free_doc', icon: '📝', content }).select('id').single()
            if (error) { showToast('שגיאה בשמירה', 'error'); return }
            setFreeEdit(f => f && { ...f, id: data.id, name, content })
            showToast('המסמך נשמר ✓', 'success')
            fetchAll()
          }}
        />
      )}

      {/* ── Gallery: every form as a same-size sheet ── */}
      {(view === 'gallery' || (view === 'editor' && !freeEdit)) && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input className="form-input" type="search" aria-label="חיפוש טופס" placeholder="חיפוש טופס..." value={gSearch}
              onChange={e => setGSearch(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 320, margin: 0 }} />
            <div role="group" aria-label="סוג" style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10 }}>
              {([['all', 'הכל'], ['builtin', 'מובנים'], ['mine', 'מסמכים שלי'], ['templates', 'תבניות']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setGFilter(k)} aria-pressed={gFilter === k} style={{
                  padding: '6px 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  background: gFilter === k ? '#fff' : 'transparent', color: gFilter === k ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: gFilter === k ? 600 : 400, boxShadow: gFilter === k ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {shownTiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>אין טפסים להצגה — אפשר ליצור מ&quot;+ חדש&quot;.</div>
          ) : (
            <div className="doc-grid">
              {shownTiles.map(t => (
                <div key={t.key} className="doc-tile">
                  <button type="button" className="doc-sheet" onClick={t.open} aria-label={`פתח ${t.title}`}>
                    <span className="doc-sheet-head"><span aria-hidden="true">{t.icon}</span></span>
                    <span className="doc-sheet-lines" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                    <span className="doc-sheet-kind">{t.kind}</span>
                  </button>
                  <div className="doc-tile-foot">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="doc-tile-title">{t.title}</div>
                      <div className="doc-tile-sub">{t.sub}</div>
                    </div>
                    {t.actions && <RowActionsMenu variant="plain" align="end" actions={t.actions} />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hiddenBuiltins.length > 0 && (
            <details style={{ marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer' }}>טפסים מובנים שהוסרו ({hiddenBuiltins.length})</summary>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {hiddenBuiltins.map(t => (
                  <button key={t.key} type="button" onClick={() => setHidden(t.key, false)} className="doc-back">↩ {t.title}</button>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── Print copies ── */}
      <Modal open={!!printAsk} onClose={() => setPrintAsk(null)} title={printAsk ? `הדפסה — ${printAsk.title}` : ''} maxWidth={360}
        footer={<>
          <Button variant="secondary" onClick={() => setPrintAsk(null)}>ביטול</Button>
          <Button onClick={() => { printAsk?.run(askCopies); setPrintAsk(null) }}>הדפס</Button>
        </>}>
        <label className="form-label" htmlFor="doc-copies">מספר עותקים</label>
        <input id="doc-copies" type="number" min={1} max={20} className="form-input" value={askCopies}
          onChange={e => setAskCopies(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} style={{ width: 100 }} />
      </Modal>

      {/* ── Add/Edit Template Modal ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editId ? 'עריכת תבנית' : 'תבנית חדשה'}
        maxWidth={580}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button variant="primary" onClick={saveTemplate} loading={saving}>שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Icon + Name */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <label className="form-label">אייקון</label>
              <input
                value={meta.icon}
                onChange={e => setMeta(p => ({ ...p, icon: e.target.value }))}
                maxLength={4}
                style={{ width: 56, padding: '7px 4px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 22, textAlign: 'center', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">שם התבנית *</label>
              <input
                value={meta.name}
                onChange={e => setMeta(p => ({ ...p, name: e.target.value }))}
                placeholder="למשל: הזמנת צמיגים"
                className="form-input"
              />
            </div>
          </div>

          {/* Columns */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label">עמודות הטבלה</label>
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
            >הוסף עמודה</button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          {/* Header / Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">שורת כותרת נוספת (אופציונלי)</label>
              <input
                value={meta.headerExtra}
                onChange={e => setMeta(p => ({ ...p, headerExtra: e.target.value }))}
                placeholder='לדוגמה: שם ספק:'
                className="form-input"
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
              <label className="form-label">שורת תחתית (אופציונלי)</label>
              <input
                value={meta.footerText}
                onChange={e => setMeta(p => ({ ...p, footerText: e.target.value }))}
                placeholder='חתימה: _______'
                className="form-input"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Paste HTML Modal ── */}
      <Modal
        open={htmlPasteOpen}
        onClose={() => setHtmlPasteOpen(false)}
        title="הדבקת קוד HTML"
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setHtmlPasteOpen(false)}>ביטול</Button>
            <Button variant="primary" onClick={savePastedHtml} loading={htmlPasteSaving}>שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="form-label">שם המסמך</label>
            <input
              value={htmlPasteName}
              onChange={e => setHtmlPasteName(e.target.value)}
              placeholder="מסמך HTML"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">קוד HTML *</label>
            <textarea
              value={htmlPasteCode}
              onChange={e => setHtmlPasteCode(e.target.value)}
              placeholder="הדבק כאן את קוד ה-HTML..."
              dir="ltr"
              rows={14}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
                borderRadius: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical',
              }}
            />
          </div>
        </div>
      </Modal>

    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

