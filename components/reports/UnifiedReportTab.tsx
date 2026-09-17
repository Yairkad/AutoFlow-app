'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildUnifiedReport, MonthlyReportRow } from '@/lib/reports/buildUnifiedReport'
import Button from '@/components/ui/Button'

const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const fmtMonth = (key: string) => { const [y, m] = key.split('-'); return `${HEB_MONTHS[parseInt(m, 10) - 1]} ${y}` }

const th: React.CSSProperties = { padding: '8px 10px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }

interface Props { tenantId: string }

export default function UnifiedReportTab({ tenantId }: Props) {
  const supabase = useRef(createClient()).current
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MonthlyReportRow[]>([])
  const [totalOpenCustomerLedger, setTotalOpenCustomerLedger] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    buildUnifiedReport(supabase, tenantId, 12).then(res => {
      setRows(res.rows)
      setTotalOpenCustomerLedger(res.totalOpenCustomerLedgerBalance)
      setLoading(false)
    })
  }, [supabase, tenantId])

  async function exportExcel() {
    setExporting(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('דוח מאוחד', { views: [{ rightToLeft: true }] })
      ws.addRow(['חודש', 'הכנסות בפועל', 'הוצאות בפועל', 'רווח בפועל', 'הכנסה מוכרת (כרטסת לקוחות)', 'חובות פתוחים - לקוחות מזדמנים', 'חובות פתוחים - ספקים', "צ'קים/העברות טרם נפרעו", 'רווח מתואם'])
      rows.forEach(r => ws.addRow([fmtMonth(r.month), r.incomeActual, r.expenseActual, r.profitActual, r.customerLedgerRecognized, r.occasionalCustomerOpen, r.supplierOpen, r.scheduledUnpaid, r.adjustedProfit]))
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'דוח-כספי-מאוחד.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>יתרת לקוחות פתוחה כוללת (כרטסת, נכון להיום)</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: totalOpenCustomerLedger >= 0 ? '#16a34a' : 'var(--danger)' }}>{fmt(totalOpenCustomerLedger)}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={exportExcel} loading={exporting}>📊 ייצוא Excel</Button>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        &quot;בפועל&quot; = תנועות כסף שכבר נרשמו — הוצאה/הכנסה שמקורה בעסקת אשראי מותאמת מופיעה כאן <b>בחודש שבו האשראי חויב בפועל</b> (לא בחודש שבו בוצעה הקנייה עצמה), כדי לשקף מתי הכסף באמת יצא/נכנס; לפירוט העסקאות הבודדות לפי תאריך קנייה יש לעיין ברשימת ההוצאות הרגילה. &quot;הכנסה מוכרת&quot; = סכום חשבוניות שהופקו ללקוחות כרטסת באותו חודש, בלי קשר לגבייה בפועל. &quot;חובות פתוחים&quot; = הסכום מאותו חודש שעדיין לא שולם/נגבה נכון להיום. &quot;רווח מתואם&quot; = רווח בפועל + הכנסה מוכרת + חובות פתוחים ללקוחות − חובות פתוחים לספקים − צ'קים/העברות שטרם נפרעו.
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>חודש</th>
              <th style={th}>הכנסות בפועל</th>
              <th style={th}>הוצאות בפועל</th>
              <th style={th}>רווח בפועל</th>
              <th style={th}>הכנסה מוכרת (כרטסת)</th>
              <th style={th}>פתוח - לקוחות מזדמנים</th>
              <th style={th}>פתוח - ספקים</th>
              <th style={th}>צ'קים/העברות טרם נפרעו</th>
              <th style={th}>רווח מתואם</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.month}>
                <td style={{ ...td, fontWeight: 600 }}>{fmtMonth(r.month)}</td>
                <td style={{ ...td, color: '#16a34a' }}>{fmt(r.incomeActual)}</td>
                <td style={{ ...td, color: 'var(--danger)' }}>{fmt(r.expenseActual)}</td>
                <td style={{ ...td, fontWeight: 700, color: r.profitActual >= 0 ? '#16a34a' : 'var(--danger)' }}>{fmt(r.profitActual)}</td>
                <td style={td}>{fmt(r.customerLedgerRecognized)}</td>
                <td style={td}>{fmt(r.occasionalCustomerOpen)}</td>
                <td style={td}>{fmt(r.supplierOpen)}</td>
                <td style={td}>{fmt(r.scheduledUnpaid)}</td>
                <td style={{ ...td, fontWeight: 700, color: r.adjustedProfit >= 0 ? '#16a34a' : 'var(--danger)' }}>{fmt(r.adjustedProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
