import { SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { supplierEvents, invoiceCoverage } from '@/lib/debts/supplierLedger'

// "ייצוא לאמיר תזרים" — three workbooks in the columns Amir Tazrim asked for:
//   1. open supplier invoices  2. outstanding checks + all bank transfers
//   3. open customer invoices (תקבולים)
// Every export is the full current state and overwrites the previous files (fixed names, no
// date) — so there is no date range. Cash / card are not exported (Amir doesn't need them).
// Invoices are a running account (lib/debts/ledger.ts) — no per-invoice paid status — so an
// invoice's open amount is derived: payments + credits cover the oldest invoices first.

export interface AmirFile { name: string; buffer: ArrayBuffer; rows: number; missingRef: string[] }

const PAGE = 1000
async function fetchAll<T>(sb: SupabaseClient, table: string, tenantId: string, cols = '*'): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).eq('tenant_id', tenantId).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return out
  }
}

const todayISO = () => new Date().toLocaleDateString('en-CA')
const toDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

/** "שוטף + N": end of the invoice's month, plus N days. */
export function expectedPayDate(invoiceIso: string, termsDays: number): Date {
  const [y, m] = invoiceIso.slice(0, 10).split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)) // last day of the invoice's month
  d.setUTCDate(d.getUTCDate() + termsDays)
  return d
}

interface Party { id: string; name: string; payment_terms_days?: number | null }
interface DebtRow {
  id: string; supplier_id?: string | null; customer_id?: string | null; amount: number; paid: number
  date: string; direction?: string | null; is_closed?: boolean; doc_number: string | null
  invoices: { number?: string }[] | null; description: string | null
}
interface SchedRow {
  id: string; supplier_id: string | null; amount: number; due_date: string; payment_method: string
  check_number: string | null; is_paid: boolean; allocation_ignored?: boolean | null; handed_date?: string | null
  description: string; created_at: string
}

const invNumber = (d: DebtRow) =>
  d.doc_number || (d.invoices ?? []).map(i => i.number).filter(Boolean).join(', ')

const termsOf = (p?: Party) => (p?.payment_terms_days ?? 30)

interface InvoiceLine { due: Date; date: Date; ref: string; name: string; amount: number }

function openLines(debts: DebtRow[], coverage: Map<string, number>, party: (d: DebtRow) => Party | undefined): InvoiceLine[] {
  const lines: InvoiceLine[] = []
  for (const d of debts) {
    if (d.direction === 'credit') continue
    const open = Number(d.amount) - (coverage.get(d.id) ?? 0)
    if (open < 0.005) continue
    const p = party(d)
    lines.push({
      due: expectedPayDate(d.date, termsOf(p)), date: toDate(d.date), ref: invNumber(d),
      name: p?.name ?? d.description ?? '', amount: Math.round(open * 100) / 100,
    })
  }
  return lines.sort((a, b) => a.due.getTime() - b.due.getTime())
}

/** Customer side: same oldest-first coverage, from Σcredits + Σpayments (lib/debts/ledger.ts).
 *  An invoice tagged "🏷 מכוסה" (is_closed — e.g. imported as paid with no payment row) counts as
 *  fully covered without consuming the payment pool, like the supplier side's write-off. */
function customerCoverage(debts: DebtRow[], paid: number): Map<string, number> {
  let pool = paid + debts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
  const out = new Map<string, number>()
  for (const d of [...debts].filter(d => d.direction !== 'credit').sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.is_closed) { out.set(d.id, Number(d.amount)); continue }
    const take = Math.max(0, Math.min(Number(d.amount), pool))
    out.set(d.id, take); pool -= take
  }
  return out
}

async function workbook(title: string, headers: string[], rows: (string | number | Date)[][], widths: number[], dateCols: number[], moneyCol: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
  ws.addRow(headers).font = { bold: true }
  rows.forEach(r => ws.addRow(r))
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  dateCols.forEach(c => { ws.getColumn(c).numFmt = 'dd/mm/yyyy' })
  ws.getColumn(moneyCol).numFmt = '#,##0.00'
  ws.getRow(1).getCell(moneyCol).numFmt = 'General'
  return await wb.xlsx.writeBuffer() as ArrayBuffer
}

const METHOD_HE: Record<string, string> = { check: 'שיק', transfer: 'העברה בנקאית', bank_transfer: 'העברה בנקאית' }

/** Rows with no reference, as "name (date)" — shown to the user as a warning after export. */
const missing = <T,>(rows: T[], hasRef: (r: T) => boolean, label: (r: T) => string) => rows.filter(r => !hasRef(r)).map(label)
const dmy = (d: Date) => d.toLocaleDateString('he-IL', { timeZone: 'UTC' })

export async function buildAmirFiles(sb: SupabaseClient, tenantId: string): Promise<AmirFile[]> {
  const [suppliers, customers, sDebts, allocs, sched, cDebts, cPays] = await Promise.all([
    fetchAll<Party>(sb, 'suppliers', tenantId),
    fetchAll<Party>(sb, 'customers', tenantId),
    fetchAll<DebtRow>(sb, 'supplier_debts', tenantId),
    fetchAll<{ supplier_debt_id: string; scheduled_payment_id: string | null; amount: number; created_at: string }>(sb, 'supplier_debt_payments', tenantId),
    fetchAll<SchedRow>(sb, 'scheduled_payments', tenantId),
    fetchAll<DebtRow>(sb, 'customer_ledger_debts', tenantId),
    fetchAll<{ customer_id: string | null; amount: number }>(sb, 'customer_ledger_payments', tenantId),
  ])
  const today = todayISO()
  const supById = new Map(suppliers.map(s => [s.id, s]))
  const custById = new Map(customers.map(c => [c.id, c]))

  // 1. Open supplier invoices — per supplier, exactly like the suppliers screen's ledger
  const supCoverage = new Map<string, number>()
  const supIds = new Set(sDebts.map(d => d.supplier_id ?? null))
  for (const sid of supIds) {
    const debts = sDebts.filter(d => (d.supplier_id ?? null) === sid)
    const ledgerDebts = debts.map(d => ({ ...d, is_closed: !!d.is_closed, direction: d.direction ?? undefined }))
    const ev = supplierEvents(ledgerDebts, allocs, sid ? sched.filter(p => p.supplier_id === sid) : [], today)
    invoiceCoverage(ledgerDebts, ev).forEach((v, k) => supCoverage.set(k, v))
  }
  const supLines = openLines(sDebts, supCoverage, d => (d.supplier_id ? supById.get(d.supplier_id) : undefined))

  // 4. Open customer invoices
  const custCoverage = new Map<string, number>()
  const custIds = new Set(cDebts.map(d => d.customer_id ?? null))
  for (const cid of custIds) {
    const paid = cPays.filter(p => (p.customer_id ?? null) === cid).reduce((s, p) => s + Number(p.amount), 0)
    customerCoverage(cDebts.filter(d => (d.customer_id ?? null) === cid), paid).forEach((v, k) => custCoverage.set(k, v))
  }
  const custLines = openLines(cDebts, custCoverage, d => (d.customer_id ? custById.get(d.customer_id) : undefined))

  // 2. Outstanding checks (not yet cleared) + all bank transfers, past ones too (Amir cross-checks them against the bank)
  const supName = (p: SchedRow) => (p.supplier_id ? supById.get(p.supplier_id)?.name : null) ?? p.description
  const bankPays = sched
    .filter(p => ['check', 'transfer', 'bank_transfer'].includes(p.payment_method) && (p.payment_method !== 'check' || !p.is_paid))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const isCheck = (p: SchedRow) => p.payment_method === 'check'

  const invHeaders = ['תאריך ערך צפוי לתשלום', 'תאריך אסמכתא', 'אסמכתא', 'פרטים', 'סכום']
  const invRows = (l: InvoiceLine[]) => l.map(x => [x.due, x.date, x.ref, x.name, x.amount])

  const invMissing = (l: InvoiceLine[]) => missing(l, x => !!x.ref.trim(), x => `${x.name} (${dmy(x.date)})`)

  return [
    { name: 'חשבוניות ספקים פתוחות.xlsx', rows: supLines.length, missingRef: invMissing(supLines),
      buffer: await workbook('חשבוניות ספקים', invHeaders, invRows(supLines), [22, 16, 16, 30, 14], [1, 2], 5) },
    { name: 'שיקים והעברות.xlsx', rows: bankPays.length,
      // transfers carry no reference by design (it comes from the bank) — only checks need a number
      missingRef: missing(bankPays.filter(isCheck), p => !!p.check_number?.trim(), p => `${supName(p)} (${dmy(toDate(p.due_date))})`),
      buffer: await workbook('שיקים והעברות', ['סוג תנועה', 'מספר שיק', 'תאריך פירעון', 'סכום', 'ספק'],
        bankPays.map(p => [METHOD_HE[p.payment_method] ?? p.payment_method, isCheck(p) ? (p.check_number ?? '') : '', toDate(p.due_date), Number(p.amount), supName(p)]),
        [16, 12, 14, 14, 30], [3], 4) },
    { name: 'תקבולים - חשבוניות לקוחות פתוחות.xlsx', rows: custLines.length, missingRef: invMissing(custLines),
      buffer: await workbook('תקבולים', invHeaders, invRows(custLines), [22, 16, 16, 30, 14], [1, 2], 5) },
  ]
}
