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
  'סרן קדמי ומערכת היגוי',
  'תיבת הילוכים',
  'מערכת העברת כוח',
  'קפיצים',
  'בולמי זעזועים',
  'מתלה קדמי',
  'מתלה אחורי',
  'מערכת בלמים (ללא פירוק גלגלים)',
  'בלם עזר',
  'צמיגים',
  'חישוקים',
  'שלדת מרכב',
  'מרכב (פחחות)',
  'אביזרי בטיחות',
  'מערכת תאורה (כולל מצבר)',
  'מחוונים',
]

// ── Common faults per system — official MOT list (נספח 5) ─────────────────────

const COMMON_FAULTS: Record<string, string[]> = {
  'מנוע': [
    'בלאי פנימי גבוה', 'שריפות שמן ממובילי שסתומים', 'פולי מנוע זורק', 'מנוע שורף שמן',
    'לחץ שמן נמוך', 'לחץ עוקה גבוה (מבלאי)', 'מנוע נכבה באיחור', 'צינור נשם מנותק',
    'מנוע לפני שיפוץ', 'רטיבות שמן במסנן אויר', 'דליפות לחץ גבוהות בצילינדרים',
    'מצתים רטובים בשמן', 'דליפות לחץ בינוניות בצילינדרים', 'הברגות פגומות בראש מנוע',
    'לחץ דחיסה נמוך', 'מעבר לחץ למערכת קירור', 'לחץ דחיסה גבוה', 'הספק מנוע ירוד',
    'לחץ דחיסה לא זהה', 'סימני דליפה בין ראש מנוע והבלוק', 'מנוע מצלצל',
    'נוזל קירור בשמן', 'רעש מערכת שסתומים', 'סימני מים בנשם מנוע',
    'רעש מערכת תזמון', 'סדק בגוף המנוע', 'רעש מערכת תזמון ושסתומים', 'פקקי מים פגומים',
    'רעשים במנוע', 'נזילת מים מפקקי מים', 'רעשים ונקישות פנימיים', 'תושבות מנוע פגומות',
    'רעש פנימי ממסבים', 'מדיד שמן פגום', 'נקישות גל זיזים', 'מעיכות אגן שמן',
    'חוסר שמן במנוע', 'הלחמות בבלוק המנוע', 'נזילות שמן', 'חופש גל ארכובה',
  ],
  'מערכת קירור': [
    'נזילות מים ממצנן', 'ריקבון במצנן', 'רשת מצנן פגומה', 'מסגרת מצנן שבורה',
    'מכסה מצנן פגום', 'מיכל עיבוי פגום', 'ניקוי מערכת הקירור', 'התחממות יתר במנוע',
    'קורוזיה וסימני נזילה בחיבורים', 'נזילות מים', 'צינורות מים פגומים', 'פקקי מים נוזלים',
    'נזילה ממשאבת מים', 'רעש ממשאבת מים', 'קורוזיה בית תרמוסטט', 'מערכת חימום לקויה',
    'ברז מערכת חימום פגום', 'מאוורר פגום', 'מצמד מאוורר פגום', 'כונס אויר פגום',
    'רצועה פגומה', 'שמן במים', 'קיים אויר במערכת הקירור', 'מערכת קירור לקויה',
  ],
  'מערכת דלק': [
    'תצרוכת דלק גבוהה', 'מאייד לא תקין', 'דוושת דלק נתפסת', 'כבל גז פגום',
    'צינורות דלק פגומים', 'מעיכות במיכל הדלק', 'תיקונים במיכל הדלק', 'נזילה במיכל הדלק',
    'מסנן אויר לקוי', 'ריח דלק בתא נוסעים', 'משנק לא תקין', 'משאבת דלק פגומה',
    'סיבובי מנוע לא יציבים', 'חסר צינורות לחימום תערובת', 'מחשב מערכת דלק לא נבדק',
    'מדגש טורבו לא תקין', 'הזרקת דלק לקויה', 'מערכת הזרקת דלק לא נבדקה', 'מגדש טורבו לא נבדק',
  ],
  'מערכת הצתה': [
    'לתאם מנוע', 'מנוע מזייף', 'מצתים לא תקינים', 'חוטי הצתה פגומים',
    'מצתים שונים', 'קיימים מאריכי מצתים', 'התנעה קשה', 'מנוע מצלצל',
    'מנוע נכבה באיחור', 'מפלג רועש', 'מתג התנעה פגום', 'מערכת הצתה פגומה',
  ],
  'מערכת פליטה': [
    'דוד עמעם אחורי פגום', 'דוד עמעם מרכזי פגום', 'דוד עמעם קדמי פגום',
    'קצה צינור רקוב', 'דליפה בחיבורי צינורות', 'מעיכות במערכת', 'מתלים פגומים',
    'צנרת פגומה', 'ריקבון כללי במערכת', 'סעפת סדוקה', 'דליפות מהסעפת',
    'חסרים ברגים', 'מערכת פליטה רועשת', 'ממיר קטליטי לא תקין',
  ],
  'סרן קדמי ומערכת היגוי': [
    'זוויות היגוי (כיוון)', 'שחיקת צמיגים', 'סטיות הגה (בנסיעה)', 'רעידות בגלגלים',
    'נקישה בתיבת הגה', 'חופש ונקישה בתיבת הגה', 'גומיות מגן להגה פגומות',
    'משולש עקום', 'קופלונג הגה פגום', 'מעיכה במשולש', 'משאבת הגה פגומה',
    'נזילת שמן במערכת הידראולית', 'בולם זעזועים להגה פגום',
    'חופש מוט הגה בתא נהג', 'חופש במערכת היגוי', 'חופש זרוע עזר',
    'תיבת הגה פגומה', 'הגה קשה ולא חוזר', 'גלגל הגה אינו ממורכז',
    'חוסר יציבות', 'סטיות במקביליות ומרחקי צירים', 'חופש חיבורי ציר קדמי',
    'חופש במסרק הגה', 'מידות מרכב אינם עפ"י הוראת יצרן', 'גומיות מגן קרועות',
  ],
  'תיבת הילוכים': [
    'שמן כהה בלאי דסקיות הילוכים', 'החלפת הילוכים לקויה', 'נקישה בשילוב הילוכים',
    'החלקה בתאוצה', 'רעידות בתאוצה', 'כבל הילוך חוזר פגום', 'מנגנון חניה לקוי',
    'חדירת מים לשמן בתיבת ההילוכים', 'נזילת שמן תיבת הילוכים', 'רעש מתיבת הילוכים',
    'חופשים במנגנוני הילוכים', 'חריקות בשילוב הילוכים', 'שילוב הילוכים קשה',
    'הילוך קופץ', 'תיבת הילוכים פגומה', 'תושבת תיבת הילוכים פגומה',
  ],
  'מערכת העברת כוח': [
    'מצמד מפריד גבוה (בלאי)', 'מצמד מחליק', 'מצמד קשה', 'רעידות במצמד',
    'כבל מצמד פגום', 'נזילת משאבת מצמד', 'מסב לחץ רועש', 'חסר מכסה בית מצמד',
    'בית מצמד שבור ומתוקן', 'גומיות מגן לציריות פגומות', 'חופש ונקישות בציריות',
    'חופש ונקישות ציריה שמאלית', 'חופש ונקישות ציריה ימנית', 'חופש צלבים',
    'קופלונג גל-הינע פגום', 'חופש תושבת גל-הינע', 'חופש דיפרנציאל',
    'נזילת שמן בדיפרנציאל', 'דיפרנציאל רועש', 'נקישה בדיפרנציאל',
    'נזילות שמן מערכת הנעה', 'רעידות בנסיעה', 'מערכת 4X4 אינה פועלת',
    'נזילת שמן ציריות', 'רעש מסבי גלגלים',
  ],
  'קפיצים': [
    'קפיצים קדמיים נמוכים', 'קפיצים אחוריים נמוכים',
    'קפיצים קדמיים אינם זהים', 'קפיצים אחוריים אינם זהים',
    'קפיץ קדמי ימני שבור', 'קפיץ קדמי שמאלי שבור',
    'קפיץ אחורי ימני שבור', 'קפיץ אחורי שמאלי שבור',
    'תותבים לקפיצים', 'תותבים לקפיצים קדמיים', 'תותבים לקפיצים אחוריים',
    'קיימות טבעות הגבהה בקפיצים', 'פין מרכזי לקפיצים שבור',
  ],
  'בולמי זעזועים': [
    'בולמי זעזועים קדמיים חלשים', 'בולמי זעזועים אחוריים חלשים',
    'תותבים לבולמי זעזועים', 'אוגר לחץ פגום', 'אוגר לחץ רועש', 'בומבות קשות',
    'נזילת שמן במערכת הידראולית',
  ],
  'מתלה קדמי': [
    'חופש מייצב קדמי', 'נקישות במתלה', 'חריקות במתלה', 'גשר קדמי עקום', 'גשר קדמי סדוק',
    'מעיכות בגשר', 'מעיכה במשולש', 'חופש תותבים ציר קדמי', 'חופש חיבורי ציר קדמי',
    'חופש משולשים במתלה', 'בושינג בלוי',
  ],
  'מתלה אחורי': [
    'גשר אחורי עקום', 'מוט מייצב אחורי עקום', 'חופש תותבים ציר אחורי',
    'מסבי גלגלים רועשים', 'תומך סרן אחורי עקום', 'זווית ציר אחורי פגומה',
    'בושינג בלוי', 'נקודות חיבור חלודות', 'זרוע עקומה',
  ],
  'מערכת בלמים (ללא פירוק גלגלים)': [
    'רפידות שחוקות', 'צלחות שחוקות', 'בלימה לקויה', 'מתקן בקורת בלמים לקוי',
    'רעידות בבלימה', 'סטיות בבלימה', 'חריקות בבלימה', 'נקישות בבלימה',
    'דוושת בלם נמוכה', 'דוושת בלם יורדת', 'רעידות בלחיצת דוושת בלם',
    'חופש דוושת בלם', 'נזילה במשאבת וויסות', 'משאבת וויסות פגומה',
    'לפרק גלגלים לבדיקה', 'נזילה משאבת אופן קדמית ימין', 'נזילה משאבת אופן קדמית שמאל',
    'נזילה משאבת אופן אחורית ימין', 'נזילה משאבת אופן אחורית שמאל',
    'צינורות גמישים קדמיים פגומים', 'צינורות גמישים אחוריים פגומים',
    'צינורות מתכת פגומים', 'מגבר בלם פגום', 'חסר ביטחונית לרפידות בלם',
    'מערכת בלמים לקויה', 'ABS אינה פועלת', 'חסר נוזל בלמים',
  ],
  'בלם עזר': [
    'בלם יד אינו תקין', 'מנגנון בלם עזר פגום', 'כבל בלם עזר פגום',
    'בלם יד רפוי', 'כבל בלם יד מתוח', 'מנגנון בלם יד תקול',
  ],
  'צמיגים': [
    'צמיג חילוף פגום', 'צמיגים קדמיים פגומים', 'צמיגים אחוריים פגומים',
    'שחיקת צמיגים בינונית', 'צמיג קדמי ימני פגום', 'צמיג קדמי שמאלי פגום',
    'צמיג אחורי ימני פגום', 'צמיג אחורי שמאלי פגום', 'צמיגים יבשים',
    'צמיגים לא זהים', 'צמיגים מחודשים', 'מידת צמידים לא חוקית',
    'חסר גלגל חילוף', 'רעידה בצמיגים', 'בלאי לא אחיד',
  ],
  'חישוקים': [
    'כיפוף בחישוק', 'חישוק לא מתאים לגודל הצמיגים',
    'חישוק פגוע', 'חישוק עקום', 'חישוק חלוד', 'אגוזים חסרים',
  ],
  'שלדת מרכב': [
    'פגיעה בריצפה אחורית', 'תיקון בריצפה אחורית', 'איכול בריצפה אחורית',
    'בקורה אורכית אחורית פגועה', 'כנף פנימית אחורית פגועה',
    'עמוד אמצעי פגוע', 'עמוד קדמי פגוע', 'עמוד אחורי פגוע',
    'ריצפת תא נוסעים פגועה', 'דופן פנימית פגועה', 'גג פגוע / כולל חיזוקים',
    'פח חזית פגוע', 'כנף קדמית מולחמת פגועה', 'דופן פנימית בתא מנוע פגועה',
    'קורה אורכית מעבר לתושבת מנוע פגועה', 'קיר אש פגוע', 'בית גלגל קדמי פגוע',
    'פח דופן אחורי פגוע', 'כנף אחורי מולחמת פגועה', 'הפרש במקביליות מעוות בשלדה',
    'פח סף פנימי פגוע', 'חיבורים לא מקוריים לרוחב הרכב',
  ],
  'מרכב (פחחות)': [
    'מכסה מנוע פגוע', 'כנף קדמי ימין (ברגים) פגועה', 'כנף קדמי שמאלי (ברגים) פגועה',
    'דלת קדמית ימין פגועה', 'דלת קדמית שמאל פגועה',
    'דלת אחורית ימין פגועה', 'דלת אחורית שמאל פגועה', 'מכסה תא מטען פגוע',
    'צבע ופחחות כללית במצב ירוד', 'תיקונים כלליים בגוף המרכב',
    'חסר פינות לפגוש', 'כיפוף בפגוש', 'שמשה פגומה',
    'חדירת מים לתא הנוסעים', 'דלתות אינם מכוונות',
    'חופש צירים בדלתות', 'עצר ביטחון לדלת', 'גומיות לדלתות וחלונות פגומות',
    'מנעול לדלת פגום', 'ריפוד פגום', 'מנגנוני שמשות אינם תקינים',
    'פתיחת מכסה מנוע לקויה', 'פתיחת תא מטען לקויה', 'תומך מכסה מנוע פגום',
    'הפרש מקביליות מבעיה טכנית',
  ],
  'אביזרי בטיחות': [
    'חגורת בטיחות פגומה', 'כרית אוויר מחוסרת', 'נעילת דלתות אינה תקינה',
  ],
  'מערכת תאורה (כולל מצבר)': [
    'פנסי חזית פגומים', 'פנס חזית משוחרר', 'פנסים אחוריים פגומים',
    'לתקן אור בלם', 'לתקן מערכת איתות', 'אור חניה אינו פועל',
    'החלפת אורות אינה פועלת', 'פנס אחורי שבור', 'פנס חזית שבור', 'פנס סדוק',
    'מערכת מגבים אינה פועלת', 'צופר אינו פועל', 'חוטי חשמל גלויים',
    'קצרים במערכת חשמל', 'הפעלת חלונות חשמל לקויה',
    'מצבר חלש', 'מצבר פגום', 'מצבר אינו מטופל', 'תושבת מצבר שבורה',
    'חופש קוטבי מצבר', 'מתנע פגום-רועש', 'אלטרנטור רועש', 'תומך אלטרנטור פגום',
    'אין טעינה', 'מזגן אוויר אינו פועל', 'מזגן אוויר מנותק', 'חסר גז במזגן',
    'מערכת אוורור פנימית אינה פועלת',
  ],
  'מחוונים': [
    'מד חום פגום', 'מד דלק פגום', 'מד לחץ שמן פגום', 'מד טעינה פגום',
    'מד מהירות פגום', 'מונה ק"מ פגום', 'מד תת-לחץ פגום', 'מד סיבובי מנוע פגום',
    'ביקורת לחץ שמן לקויה', 'ביקורת בלמים לקויה', 'ביקורת טעינה לקויה',
    'לוח מחוונים פגום', 'הבקרה בלוח שעונים פגומה', 'ריפוד לוח שעונים קרוע / סדוק',
    'רעשים בלוח שעונים', 'טכוגרף פגום',
  ],
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
  owner_id: string | null
  owner_phone: string | null
  owner_address: string | null
  inspector: string | null
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
  inspectors: string[]
  onClose: () => void
  onSave: (insId: string, findings: string, inspector?: string) => Promise<void>
}

// ── Parse / default ────────────────────────────────────────────────────────────

export function parseFindings(raw: string | null): { items: ChecklistItem[], notes: string } {
  const blank = INSPECTION_SYSTEMS.map(() => ({ status: '' as const, faults: [] }))
  if (!raw) return { items: blank, notes: '' }
  try {
    const parsed = JSON.parse(raw)
    // New format: { items: [...], notes: string }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) {
      const items = parsed.items.length === INSPECTION_SYSTEMS.length
        ? parsed.items.map((p: ChecklistItem & { notes?: string }) => ({
            status: p.status ?? '',
            faults: Array.isArray(p.faults) && p.faults.length > 0 ? p.faults : p.notes ? [p.notes] : [],
          }))
        : blank
      return { items, notes: parsed.notes ?? '' }
    }
    // Old format: plain array
    if (Array.isArray(parsed) && parsed.length === INSPECTION_SYSTEMS.length) {
      return {
        items: parsed.map((p: ChecklistItem & { notes?: string }) => ({
          status: p.status ?? '',
          faults: Array.isArray(p.faults) && p.faults.length > 0 ? p.faults : p.notes ? [p.notes] : [],
        })),
        notes: '',
      }
    }
  } catch {}
  return { items: blank, notes: '' }
}

// ── Print ──────────────────────────────────────────────────────────────────────

export function printChecklist(inspection: InspectionBasic, business: BusinessBasic, items: ChecklistItem[], inspectorNotes = '', inspectorName = '') {
  const date = inspection.date || new Date().toLocaleDateString('he-IL')

  const makeRow = (name: string, i: number) => {
    const item = items[i]
    const isOk   = item.status === 'ok'
    const isFail = item.status === 'fail'
    const notesText = item.faults.filter(Boolean).join(' | ')
    return `<tr style="${isFail ? 'background:#fff0f0' : isOk ? 'background:#f0fff4' : ''}">
      <td style="text-align:center;width:26px">${i + 1}</td>
      <td style="text-align:right;padding-right:8px;font-weight:700;width:165px">${name}</td>
      <td style="text-align:center;font-size:15px;color:#16a34a;font-weight:700">${isOk ? '✓' : ''}</td>
      <td style="text-align:center;font-size:15px;color:#dc2626;font-weight:700">${isFail ? '✗' : ''}</td>
      <td style="text-align:right;padding:2px 6px;font-size:10.5px">${notesText}</td>
    </tr>`
  }

  // Split 21 systems: first 11 on page 1, remaining 10 on page 2
  const rows1 = INSPECTION_SYSTEMS.slice(0, 11).map((n, i) => makeRow(n, i)).join('')
  const rows2 = INSPECTION_SYSTEMS.slice(11).map((n, i) => makeRow(n, i + 11)).join('')

  const notesForPrint = inspectorNotes
    ? `<p style="font-size:10.5px;white-space:pre-wrap">${inspectorNotes}</p>`
    : ''

  const banner = `
  <div class="bsd">בס"ד</div>
  <div class="hdr">
    <div class="biz">
      <div class="biz-name">${business.name}</div>
      ${business.sub_title ? `<div class="biz-info">${business.sub_title}</div>` : ''}
      ${business.address    ? `<div class="biz-info">${business.address}</div>` : ''}
      ${business.phone      ? `<div class="biz-info">טל׳: ${business.phone}</div>` : ''}
      ${business.license_number ? `<div class="biz-info">מס׳ רישיון מוסך: ${business.license_number}</div>` : ''}
    </div>
    <div class="logo-wrap">
      ${business.logo ? `<img class="logo-img" src="${business.logo}" alt="לוגו">` : ''}
      <div class="logo-svc">מוסך מורשה | פנצ׳רייה | פחחות | מכון בדיקת רכב | כיוון פרונט</div>
    </div>
  </div>`

  const tableHead = `<table>
    <thead><tr>
      <th>מס"ד</th><th>המערכת</th>
      <th style="width:38px">תקין</th><th style="width:38px">לא תקין</th>
      <th>אבחנה</th>
    </tr></thead>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ממצאי בדיקה – ${inspection.plate}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; font-size: 11px; line-height: 1.35; }
.page { width:210mm; min-height:296mm; padding:10mm 15mm; position:relative; }
.page + .page { page-break-before: always; }
.bsd { text-align:right; font-weight:bold; font-size:11px; margin-bottom:3px; }
.hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:4mm; padding-bottom:4mm; border-bottom:2px solid #000; }
.biz { font-weight:bold; font-size:13px; line-height:1.5; }
.biz-name { font-size:16px; font-weight:900; }
.biz-info { font-size:11px; }
.logo-wrap { text-align:center; }
.logo-img { max-height:110px; max-width:240px; object-fit:contain; mix-blend-mode:multiply; filter:contrast(1.1); display:block; margin:0 auto; }
.logo-svc { font-size:9px; text-align:center; font-weight:bold; margin-top:4px; letter-spacing:0.5px; color:#333; }
.title-box { text-align:center; border:2.5px solid #000; padding:5px 8px; margin-bottom:4mm; }
.title-box h1 { font-size:13.5px; font-weight:900; text-decoration:underline; margin:0; }
.title-box p  { font-size:10px; margin:3px 0 0; }
.info-panels { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-bottom:4mm; }
.info-panel { border:1px solid #ccc; border-radius:4px; padding:5px 8px; }
.info-panel-title { font-size:11px; font-weight:900; border-bottom:1.5px solid #000; margin-bottom:4px; padding-bottom:2px; }
.car-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:2px 6px; }
.car-cell { font-size:11px; padding:1px 0; }
.car-cell b { font-weight:700; }
.insp-num { font-size:11px; font-weight:700; border:1px solid #ccc; border-radius:4px; padding:4px 8px; margin-bottom:3mm; display:inline-block; }
table { width:100%; border-collapse:collapse; margin-bottom:4mm; font-size:10.5px; }
th { background:#eee !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; border:1px solid #000; padding:3px 4px; text-align:center; font-size:10px; font-weight:700; }
td { border:1px solid #000; padding:2px 4px; vertical-align:middle; }
.summary { border:1.5px solid #000; padding:6px 10px; margin-bottom:4mm; border-radius:3px; }
.summary-title { font-size:11px; font-weight:900; margin-bottom:4px; }
.notes { font-size:9px; line-height:1.5; margin-bottom:4mm; }
.notes p { margin:1px 0; }
.legal-box { border:2px solid #000; padding:5px 8px; font-size:9.5px; font-weight:700; line-height:1.5; margin-bottom:5mm; }
.sigs { display:flex; justify-content:space-around; padding-top:4mm; font-weight:700; font-size:11px; }
.sig-line { border-bottom:1.5px solid #000; width:130px; display:inline-block; min-height:1.3em; margin-right:4px; }
.pagenum { position:absolute; bottom:8mm; left:15mm; font-size:10px; color:#999; }
@media screen { body{background:#e5e5e5} .page{background:#fff;margin:10mm auto;box-shadow:0 2px 10px rgba(0,0,0,.15)} }
</style>
</head>
<body>

<!-- ══ עמוד 1 ══ -->
<div class="page">
  ${banner}
  <div class="title-box">
    <h1>טופס סיכום אחיד של בדיקה כללית</h1>
    <h1>ללא מערכות אלקטרוניות וממוחשבות</h1>
    <p>(ע"פ הוראות משרד התחבורה)</p>
  </div>
  <div class="insp-num">מס׳ בדיקה: <b>${inspection.id.slice(0, 8).toUpperCase()}</b>${inspectorName ? ` &nbsp;|&nbsp; בוחן: <b>${inspectorName}</b>` : ''} &nbsp;|&nbsp; תאריך: <b>${date}</b></div>
  <div class="info-panels">
    <div class="info-panel">
      <div class="info-panel-title">פרטי לקוח</div>
      <div class="car-cell"><b>שם לקוח:</b> ${inspection.owner_name}</div>
      <div class="car-cell"><b>ת.ז.:</b> ${inspection.owner_id || ''}</div>
      <div class="car-cell"><b>טלפון:</b> ${inspection.owner_phone || ''}</div>
      <div class="car-cell"><b>כתובת:</b> ${inspection.owner_address || ''}</div>
    </div>
    <div class="info-panel">
      <div class="info-panel-title">פרטי רכב</div>
      <div class="car-grid">
        <div class="car-cell"><b>מס׳ רכב:</b> ${inspection.plate}</div>
        <div class="car-cell"><b>שנת ייצור:</b> ${inspection.year || ''}</div>
        <div class="car-cell"><b>תוצר:</b> ${inspection.make || ''}</div>
        <div class="car-cell"><b>דגם:</b> ${inspection.model || ''}</div>
        <div class="car-cell"><b>מס׳ מנוע:</b> ${inspection.engine_cc || ''}</div>
        <div class="car-cell"><b>מס׳ שלדה:</b> ${inspection.chassis || ''}</div>
        <div class="car-cell"><b>ק"מ:</b> ${inspection.km || ''}</div>
        <div class="car-cell"><b>סוג רכב:</b> ${inspection.ownership_type || ''}</div>
      </div>
    </div>
  </div>
  ${tableHead}<tbody>${rows1}</tbody></table>
  <div class="pagenum">עמוד 1 מתוך 2</div>
</div>

<!-- ══ עמוד 2 ══ -->
<div class="page">
  ${banner}
  ${tableHead}<tbody>${rows2}</tbody></table>
  <div class="summary">
    <div class="summary-title">הערות נוספות:</div>
    ${notesForPrint}
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
    <div>חתימת הבוחן: <span class="sig-line">${inspectorName}</span></div>
    <div>תאריך: <span class="sig-line">${date}</span></div>
    <div>חתימת המזמין: <span class="sig-line"></span></div>
  </div>
  <div class="pagenum">עמוד 2 מתוך 2</div>
</div>

<script>window.onload=function(){window.print()}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
  w.document.write(html)
  w.document.close()
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function InspectionChecklistModal({ inspection, business, inspectors, onClose, onSave }: Props) {
  const [items,          setItems]          = useState<ChecklistItem[]>(() => parseFindings(inspection.findings).items)
  const [inspectorNotes, setInspectorNotes] = useState(() => parseFindings(inspection.findings).notes)
  const [inspector,      setInspector]      = useState(inspection.inspector ?? (inspectors[0] ?? ''))
  const [step,           setStep]           = useState(0)
  const [saving,         setSaving]         = useState(false)

  const TOTAL = INSPECTION_SYSTEMS.length
  const isSummary = step === TOTAL

  // ── Item mutations ────────────────────────────────────────────────────────────

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
    if (step < TOTAL) {
      const cur = items[step]
      const hasFaults = cur.faults.filter(Boolean).length > 0
      const newStatus = hasFaults ? 'fail' : 'ok'
      setItems(prev => prev.map((item, i) => i === step ? { ...item, status: newStatus } : item))
    }
    setStep(s => Math.min(s + 1, TOTAL))
  }

  function goPrev() { setStep(s => Math.max(s - 1, 0)) }

  function jumpTo(i: number) { setStep(i) }

  // ── Save + Print ───────────────────────────────────────────────────────────────

  async function handleSave(andPrint: boolean) {
    setSaving(true)
    await onSave(inspection.id, JSON.stringify({ items, notes: inspectorNotes }), inspector || undefined)
    setSaving(false)
    if (andPrint) printChecklist(inspection, business, items, inspectorNotes, inspector)
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
              <span style={{ marginRight: 6, fontFamily: 'monospace', opacity: 0.7 }}>#{inspection.id.slice(0, 8).toUpperCase()}</span>
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
                marginBottom: 20, padding: '14px 18px', borderRadius: 12,
                background: 'linear-gradient(135deg, var(--primary-light,#e8f7f0), #f0f9ff)',
                border: '2px solid var(--primary)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  מערכת {step + 1} מתוך {TOTAL}
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>{sysName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  השאר ריק אם תקין — מלא ליקויים אם נמצאו בעיות
                </div>
              </div>

              {/* Fault lines — always visible */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Show existing faults OR one empty row */}
                {(cur.faults.length > 0 ? cur.faults : ['']).map((_fault, fi) => (
                  <div key={fi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        style={inp}
                        list={`faults-${step}`}
                        placeholder="תאר ליקוי או השאר ריק אם תקין..."
                        value={cur.faults[fi] ?? ''}
                        onChange={e => {
                          // sync back into real items array
                          setItems(prev => prev.map((item, i) => {
                            if (i !== step) return item
                            const faults = item.faults.length > 0 ? [...item.faults] : ['']
                            faults[fi] = e.target.value
                            return { ...item, faults }
                          }))
                        }}
                        autoFocus={fi === 0 && cur.faults.length === 0}
                      />
                      <datalist id={`faults-${step}`}>
                        {suggestions.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>
                    {/* Remove only if there's more than one row */}
                    {cur.faults.length > 1 && (
                      <button
                        onClick={() => removeFault(fi)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--danger)', flexShrink: 0, padding: '4px 6px' }}
                      >✕</button>
                    )}
                  </div>
                ))}

                {/* Add row button */}
                <button
                  onClick={addFault}
                  style={{
                    alignSelf: 'flex-start', marginTop: 4,
                    padding: '6px 14px', borderRadius: 8,
                    border: '1px dashed var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  + הוסף שורה
                </button>

                {/* Status indicator */}
                {cur.faults.filter(Boolean).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />
                    {cur.faults.filter(Boolean).length} ליקוי{cur.faults.filter(Boolean).length !== 1 ? 'ים' : ''} יירשמו
                  </div>
                )}
              </div>
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

              {/* Inspector selection */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>שם הבוחן</div>
                <select
                  value={inspector}
                  onChange={e => setInspector(e.target.value)}
                  style={{
                    width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
                    padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
                    background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                  }}
                >
                  <option value="">— בחר בוחן —</option>
                  {inspectors.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  {inspector && !inspectors.includes(inspector) && (
                    <option value={inspector}>{inspector}</option>
                  )}
                </select>
              </div>

              {/* Inspector notes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>הערות נוספות</div>
                <textarea
                  value={inspectorNotes}
                  onChange={e => setInspectorNotes(e.target.value)}
                  placeholder="הכנס הערות כלליות לבדיקה..."
                  rows={4}
                  style={{
                    width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
                    padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
                    background: 'var(--bg)', color: 'var(--text)', resize: 'vertical', outline: 'none',
                  }}
                />
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
                  flexShrink: 0, padding: '0 20px', height: 52, borderRadius: 12,
                  border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                  cursor: step === 0 ? 'not-allowed' : 'pointer',
                  opacity: step === 0 ? 0.35 : 1, fontSize: 22,
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
                  flexShrink: 0, padding: '0 20px', height: 52, borderRadius: 12,
                  border: '1.5px solid var(--primary)', background: 'var(--primary)',
                  color: '#fff', cursor: 'pointer',
                  fontSize: step === TOTAL - 1 ? 14 : 22,
                  fontWeight: step === TOTAL - 1 ? 700 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: step === TOTAL - 1 ? 110 : 64,
                }}
                title={step === TOTAL - 1 ? 'לסיכום' : 'הבא'}
              >
                {step === TOTAL - 1 ? '✓ לסיכום' : '›'}
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
    const parsed = JSON.parse(findings)
    const raw: ChecklistItem[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [])
    const failCount = raw.filter(i => i.status === 'fail').length
    const okCount   = raw.filter(i => i.status === 'ok').length
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
