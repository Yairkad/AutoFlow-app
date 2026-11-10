// What a bank DEBIT line most likely is, so the review screen can offer one obvious action and —
// most important to the user — show which money left the bank without being recorded.

export type LineKind =
  | 'check'      // "שיק" whose number (אסמכתא) is a check in the checks journal
  | 'card'       // monthly credit-card settlement ("לאומי ויזה") — its purchases come from the card statement
  | 'supplier'   // "העברה אל: <name>" where <name> is a supplier
  | 'fee'        // bank fees
  | 'other'

export interface CheckRow {
  id: string; check_number: string | null; amount: number; due_date: string; is_paid: boolean
  expense_id: string | null; supplier_id: string | null; description: string; notes: string | null; payment_method: 'check' | 'transfer'
}
export interface SupplierRow { id: string; name: string }

export interface Classified {
  kind: LineKind
  check?: CheckRow
  supplier?: SupplierRow
  category?: string   // suggested category (fees)
}

const CARD_RE = /ויזה|visa|ישראכרט|isracard|מאסטרקארד|mastercard|מקס איט|^מקס|max |כאל|cal |אמריקן|אמקס|amex|דיינרס|diners/i
const FEE_RE  = /^עמ[\s.]|^עמל|עמלה|עמלת|מסלול|דמי ניהול|דמי כרטיס|ריבית חובה/
const CHECK_RE = /שיק|צ'ק|צ׳ק|שק /

const norm = (s: string) => s.replace(/["'׳״.,()\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')

/** Payee written after "העברה אל:" / "תשלום עבור:" in the extended description */
export function payeeOf(description: string): string | null {
  const m = description.match(/(?:העברה אל|העברה ל|לטובת|תשלום עבור|זיכוי מ)\s*:?\s*([^;]+)/)
  return m ? m[1].replace(/\d[\d-]{5,}.*$/, '').trim() || null : null
}

function findSupplier(description: string, suppliers: SupplierRow[]): SupplierRow | undefined {
  const payee = payeeOf(description)
  if (!payee) return undefined
  const p = norm(payee)
  // Longest supplier name contained in the payee (or the payee's first words contained in the name)
  return suppliers
    .filter(s => {
      const n = norm(s.name)
      if (n.length < 2) return false
      if (p.includes(n)) return true
      const head = p.split(' ').slice(0, 2).join(' ')
      return head.length >= 3 && n.includes(head)
    })
    .sort((a, b) => b.name.length - a.name.length)[0]
}

function findCheck(reference: string | null, amount: number, checks: CheckRow[], claimed: Set<string>): CheckRow | undefined {
  const ref = digits(reference)
  const free = checks.filter(c => !claimed.has(c.id) && !(c.expense_id && claimed.has(`e:${c.expense_id}`)))
  if (ref.length >= 3) {
    const byNum = free.filter(c => {
      const n = digits(c.check_number)
      return n.length >= 3 && (ref === n || ref.endsWith(n) || n.endsWith(ref))
    })
    const exact = byNum.find(c => Math.abs(Number(c.amount) - amount) < 0.01)
    if (exact) return exact
    if (byNum.length === 1) return byNum[0]
  }
  return undefined
}

export function classifyDebit(
  line: { description: string; amount: number; reference: string | null },
  checks: CheckRow[], suppliers: SupplierRow[], claimed: Set<string>,
): Classified {
  const d = line.description
  if (CHECK_RE.test(d) || (line.reference && checks.length && findCheck(line.reference, line.amount, checks, claimed))) {
    const check = findCheck(line.reference, line.amount, checks, claimed)
    if (check) return { kind: 'check', check }
  }
  if (CARD_RE.test(d.split('—')[0])) return { kind: 'card' }
  if (FEE_RE.test(d.split('—')[0].trim())) return { kind: 'fee', category: 'עמלות בנק' }
  const supplier = findSupplier(d, suppliers)
  if (supplier) return { kind: 'supplier', supplier }
  return { kind: 'other' }
}
