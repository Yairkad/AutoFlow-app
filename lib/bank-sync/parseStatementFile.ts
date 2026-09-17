import * as XLSX from 'xlsx'

export type AmountMode = 'single' | 'debit_credit'
export type AmountSign = 'positive_is_debit' | 'positive_is_credit'

export interface ColumnMapping {
  headerRowIndex: number
  amountMode: AmountMode
  columns: {
    date: number            // transaction/purchase date -- this is what matching uses, never chargeDate
    description: number
    amount?: number        // amountMode === 'single'
    amountSign?: AmountSign // amountMode === 'single'
    debit?: number         // amountMode === 'debit_credit'
    credit?: number        // amountMode === 'debit_credit'
    balance?: number
    chargeDate?: number    // credit-card statements: when it actually posts to the bank account, informational only
    cardNumber?: number    // credit-card statements: which card, when a tenant has more than one, informational only
  }
}

export interface ParsedLine {
  rowIndex: number
  date: string          // ISO yyyy-mm-dd
  description: string
  direction: 'debit' | 'credit'
  amount: number
  balanceAfter: number | null
  chargeDate: string | null
  cardNumber: string | null
  raw: unknown[]
}

// Reads an uploaded bank/credit-card statement file. xlsx/xls are read as
// binary via XLSX.read (same pipeline already used by
// ScheduledPaymentsModal.tsx's Excel importer). A .csv is read as text first
// (File.text() decodes as UTF-8) and handed to XLSX.read as a string --
// letting SheetJS sniff encoding from raw bytes (type:'array') mis-decodes
// Hebrew content that lacks a UTF-8 BOM, which most real bank/CSV exports do.
export async function readRawRows(file: File): Promise<unknown[][]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv'
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string', cellDates: true })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
}

// Same 3-branch date parser as ScheduledPaymentsModal.tsx: Date object
// (cellDates:true), "DD/MM/YYYY"-style string, or an Excel serial number.
export function parseCellDate(cell: unknown): string | null {
  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10)
  }
  if (typeof cell === 'string') {
    const m = cell.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return null
  }
  if (typeof cell === 'number') {
    const d = new Date(Math.round((cell - 25569) * 86400000))
    return d.toISOString().slice(0, 10)
  }
  return null
}

function parseCellAmount(cell: unknown): number | null {
  if (cell == null || cell === '') return null
  const n = typeof cell === 'number' ? cell : Number(String(cell).replace(/[,₪\s]/g, ''))
  return isNaN(n) ? null : n
}

// Applies a saved/edited column mapping to the raw rows, starting after
// headerRowIndex, producing one ParsedLine per valid transaction row.
// Rows that fail to parse a date or resolve to a zero/invalid amount are
// silently skipped (typical of subtotal/footer rows in bank exports).
export function applyMapping(rawRows: unknown[][], mapping: ColumnMapping): ParsedLine[] {
  const { columns } = mapping
  const lines: ParsedLine[] = []

  for (let i = mapping.headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!row) continue

    const isoDate = parseCellDate(row[columns.date])
    if (!isoDate) continue

    const description = String(row[columns.description] ?? '').trim()

    let amount: number
    let direction: 'debit' | 'credit'

    if (mapping.amountMode === 'debit_credit') {
      const debit  = columns.debit  != null ? parseCellAmount(row[columns.debit])  : null
      const credit = columns.credit != null ? parseCellAmount(row[columns.credit]) : null
      if (debit && debit > 0)      { amount = debit;  direction = 'debit' }
      else if (credit && credit > 0) { amount = credit; direction = 'credit' }
      else continue
    } else {
      const raw = columns.amount != null ? parseCellAmount(row[columns.amount]) : null
      if (raw == null || raw === 0) continue
      const sign = mapping.columns.amountSign ?? 'positive_is_debit'
      const isDebit = sign === 'positive_is_debit' ? raw > 0 : raw < 0
      amount = Math.abs(raw)
      direction = isDebit ? 'debit' : 'credit'
    }

    if (!amount || amount <= 0) continue

    const balanceAfter = columns.balance != null ? parseCellAmount(row[columns.balance]) : null
    const chargeDate = columns.chargeDate != null ? parseCellDate(row[columns.chargeDate]) : null
    const cardNumber = columns.cardNumber != null ? String(row[columns.cardNumber] ?? '').trim() || null : null

    lines.push({ rowIndex: i, date: isoDate, description, direction, amount, balanceAfter, chargeDate, cardNumber, raw: row })
  }

  return lines
}

// Best-effort guess at a column mapping from the raw preview rows, used only
// to pre-fill the mapping screen for a brand-new source -- the user reviews
// and can change every dropdown before saving.
export function guessMapping(rawRows: unknown[][]): ColumnMapping {
  let headerRowIndex = 0
  let dateCol = 0

  outer:
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      if (parseCellDate(row[c])) { headerRowIndex = Math.max(0, r - 1); dateCol = c; break outer }
    }
  }

  const sample = rawRows[headerRowIndex + 1] ?? []
  let descCol = dateCol + 1
  let amountCol = sample.length - 1
  for (let c = 0; c < sample.length; c++) {
    if (c === dateCol) continue
    if (typeof sample[c] === 'string' && isNaN(Number(sample[c]))) { descCol = c; break }
  }
  for (let c = sample.length - 1; c >= 0; c--) {
    if (c === dateCol || c === descCol) continue
    if (parseCellAmount(sample[c]) != null) { amountCol = c; break }
  }

  return {
    headerRowIndex,
    amountMode: 'single',
    columns: { date: dateCol, description: descCol, amount: amountCol, amountSign: 'positive_is_debit' },
  }
}
