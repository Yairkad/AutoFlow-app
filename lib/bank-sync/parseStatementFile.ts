import * as XLSX from 'xlsx'

export type AmountMode = 'single' | 'debit_credit'
export type AmountSign = 'positive_is_debit' | 'positive_is_credit'

export interface ColumnMapping {
  headerRowIndex: number
  signature?: string      // header fingerprint — recognizes the same export next time
  rules?: Record<string, string>  // normalized line description → category (learned on reconcile)
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
    details?: number       // bank "תיאור מורחב": who the money went to — joined into the description
    reference?: number     // "אסמכתא" — for a check line this is the check number
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
  reference: string | null
  raw: unknown[]
}

// Reads an uploaded bank/credit-card statement file. Israeli bank exports are often NOT UTF-8:
// CSVs come in Windows-1255, and many ".xls" files are really HTML tables in that encoding —
// decoding them as UTF-8 gave gibberish (bug-098). Real Excel files (zip / OLE) are read as
// binary; old .xls (BIFF) needs the codepage tables, which the browser build of SheetJS
// doesn't load by itself.
let cptableReady = false
async function ensureCodepages() {
  if (cptableReady) return
  const cp = await import('xlsx/dist/cpexcel.full.mjs')
  XLSX.set_cptable(cp)
  cptableReady = true
}

/** Text bytes → string: UTF-8 when valid, otherwise Windows-1255 (Hebrew). */
export function decodeText(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('windows-1255').decode(bytes) }
}

export async function readRawRows(file: File): Promise<unknown[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b                                    // xlsx
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0  // old xls
  if (isOle) await ensureCodepages()
  const wb = isZip || isOle
    ? XLSX.read(bytes, { type: 'array', cellDates: true })
    : XLSX.read(decodeText(bytes), { type: 'string', raw: true })   // csv / html-as-xls: keep text (dates are DD/MM, not US)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
}

// Same 3-branch date parser as ScheduledPaymentsModal.tsx: Date object
// (cellDates:true), "DD/MM/YYYY"-style string, or an Excel serial number.
export function parseCellDate(cell: unknown): string | null {
  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return null
    // cellDates gives local midnight — build the ISO date from local parts (no UTC shift)
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`
  }
  if (typeof cell === 'string') {
    const t = cell.trim()
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      const mo = Number(m[2]), d = Number(m[1])
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    return null
  }
  if (typeof cell === 'number') {
    if (cell < 20000 || cell > 80000) return null    // not a plausible Excel date serial
    const d = new Date(Math.round((cell - 25569) * 86400000))
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function parseCellAmount(cell: unknown): number | null {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number') return cell
  let t = String(cell).replace(/[,₪\s\u200e\u200f]/g, '')
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }      // (50.00)
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1) }           // 50.00-
  const n = Number(t)
  if (isNaN(n)) return null
  return neg ? -Math.abs(n) : n
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

    // "העברה דיגיטל" alone says nothing — the extended description has the payee
    const base = String(row[columns.description] ?? '').trim()
    const details = columns.details != null ? String(row[columns.details] ?? '').trim() : ''
    const description = details && details !== base ? (base ? `${base} — ${details}` : details) : base

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

    const reference = columns.reference != null ? String(row[columns.reference] ?? '').trim() || null : null
    lines.push({ rowIndex: i, date: isoDate, description, direction, amount, balanceAfter, chargeDate, cardNumber, reference, raw: row })
  }

  return lines
}

// ── Column detection by header names ─────────────────────────────────────

const norm = (v: unknown) => String(v ?? '').replace(/["'׳״\s.:_-]+/g, ' ').trim().toLowerCase()

// Order matters: the first role whose words match a header wins that column
const HEADER_RULES: { role: keyof ColumnMapping['columns'] | 'amount'; words: string[] }[] = [
  { role: 'chargeDate',  words: ['תאריך חיוב', 'מועד חיוב'] },
  { role: 'date',        words: ['תאריך עסקה', 'תאריך רכישה', 'תאריך הפעולה', 'תאריך פעולה', 'תאריך', 'date'] },
  { role: 'cardNumber',  words: ['4 ספרות', 'ספרות אחרונות', 'מספר כרטיס', 'כרטיס'] },
  { role: 'details',     words: ['תיאור מורחב', 'פרטים נוספים', 'פירוט נוסף'] },
  { role: 'reference',   words: ['אסמכתא', 'אסמכתה', 'מספר שיק', 'reference'] },
  { role: 'balance',     words: ['יתרה', 'balance'] },
  { role: 'debit',       words: ['בחובה', 'חובה', 'debit'] },
  { role: 'credit',      words: ['בזכות', 'זכות', 'credit'] },
  { role: 'amount',      words: ['סכום חיוב', 'סכום לחיוב', 'סכום בש ח', 'סכום', 'amount'] },
  { role: 'description', words: ['שם בית העסק', 'שם בית עסק', 'בית עסק', 'תיאור', 'תאור', 'פרטים', 'הפעולה', 'פעולה', 'description'] },
]

function detectHeader(rawRows: unknown[][]): { headerRowIndex: number; cols: Partial<Record<string, number>> } | null {
  let best: { headerRowIndex: number; cols: Partial<Record<string, number>>; score: number } | null = null
  for (let r = 0; r < Math.min(rawRows.length, 40); r++) {
    const row = rawRows[r] ?? []
    const cols: Partial<Record<string, number>> = {}
    const used = new Set<number>()
    for (const rule of HEADER_RULES) {
      if (cols[rule.role] != null) continue
      for (const w of rule.words) {
        const c = row.findIndex((cell, i) => !used.has(i) && norm(cell).includes(w) && norm(cell).length <= 30)
        if (c >= 0) { cols[rule.role] = c; used.add(c); break }
      }
    }
    const hasAmount = cols.amount != null || (cols.debit != null && cols.credit != null)
    const score = (cols.date != null ? 2 : 0) + (cols.description != null ? 2 : 0) + (hasAmount ? 2 : 0) + used.size * 0.1
    if (cols.date != null && hasAmount && (!best || score > best.score)) best = { headerRowIndex: r, cols, score }
  }
  return best
}

/** A fingerprint of the header row — the same bank export always has the same headers, so a
 *  saved source is recognized automatically next time. */
export function headerSignature(rawRows: unknown[][], headerRowIndex: number): string {
  return (rawRows[headerRowIndex] ?? []).map(norm).filter(Boolean).join('|')
}

/** Finds the header row and each column's role from the header names; falls back to guessing
 *  from the cell contents. */
export function guessMapping(rawRows: unknown[][]): ColumnMapping {
  const h = detectHeader(rawRows)
  if (h) {
    const { cols, headerRowIndex } = h
    const extra = {
      balance: cols.balance, chargeDate: cols.chargeDate, cardNumber: cols.cardNumber,
      details: cols.details, reference: cols.reference,
    }
    // Description: the named column, else the widest text column
    let description = cols.description
    if (description == null) {
      const sample = rawRows.slice(headerRowIndex + 1, headerRowIndex + 20)
      const width = (rawRows[headerRowIndex] ?? []).length
      let bestLen = -1
      for (let c = 0; c < width; c++) {
        if (Object.values(cols).includes(c)) continue
        const len = sample.reduce((s, r) => s + (typeof r?.[c] === 'string' && parseCellAmount(r[c]) == null ? String(r[c]).length : 0), 0)
        if (len > bestLen) { bestLen = len; description = c }
      }
    }
    if (cols.debit != null && cols.credit != null) {
      return { headerRowIndex, amountMode: 'debit_credit', signature: headerSignature(rawRows, headerRowIndex),
        columns: { date: cols.date!, description: description ?? 0, debit: cols.debit, credit: cols.credit, ...extra } }
    }
    // One amount column: a card statement (charge date / card no. / "סכום חיוב") → positive is an
    // expense; a bank account with both signs → negative is an expense.
    const vals = rawRows.slice(headerRowIndex + 1).map(r => parseCellAmount(r?.[cols.amount!])).filter((n): n is number => n != null && n !== 0)
    const hasNeg = vals.some(n => n < 0), hasPos = vals.some(n => n > 0)
    const isCard = cols.chargeDate != null || cols.cardNumber != null || /חיוב/.test(String(rawRows[headerRowIndex]?.[cols.amount!] ?? ''))
    const amountSign: AmountSign = !isCard && hasNeg && hasPos ? 'positive_is_credit' : 'positive_is_debit'
    return { headerRowIndex, amountMode: 'single', signature: headerSignature(rawRows, headerRowIndex),
      columns: { date: cols.date!, description: description ?? 0, amount: cols.amount, amountSign, ...extra } }
  }
  return guessByContent(rawRows)
}

function guessByContent(rawRows: unknown[][]): ColumnMapping {
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
