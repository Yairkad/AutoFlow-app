// Global search (Header, Ctrl+K): one term → every module, optionally narrowed to one field
// (name / phone / invoice no. / amount / plate) and one kind of result.
// Every result carries a deep link (?open=<id>&q=<text>&month=YYYY-MM) that the target page reads.

import type { SupabaseClient } from '@supabase/supabase-js'
import { likePatterns } from './fuzzy'
import { tireSizeText } from '@/lib/tires/size'
import { brandsMatchingHe } from '@/lib/tires/brands'

export type SearchField = 'all' | 'name' | 'phone' | 'invoice' | 'amount' | 'plate'
export type SearchKind  = 'all' | 'contacts' | 'invoices' | 'money' | 'cars' | 'stock' | 'employees'

export const FIELD_LABELS: Record<SearchField, string> = {
  all: 'הכל', name: 'שם / איש קשר', phone: 'טלפון', invoice: "מס' חשבונית / צ'ק", amount: 'סכום', plate: "מס' רכב",
}
export const KIND_LABELS: Record<SearchKind, string> = {
  all: 'הכל', contacts: 'לקוחות וספקים', invoices: 'חשבוניות וחובות', money: "הוצאות, הכנסות וצ'קים",
  cars: 'רכבים ובדיקות', stock: 'מוצרים וצמיגים', employees: 'עובדים',
}

export interface SearchResult {
  key: string
  icon: string
  primary: string
  secondary?: string
  category: string
  href: string
}

const LIMIT = 6
const ils = (n: unknown) => (n == null || n === '' ? null : `₪${Number(n).toLocaleString('he-IL')}`)
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('he-IL') : null)
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

function link(path: string, p: { open?: string | null; q?: string | null; month?: string | null; tab?: string }) {
  const u = new URLSearchParams()
  if (p.tab) u.set('tab', p.tab)
  if (p.open) u.set('open', p.open)
  if (p.q) u.set('q', p.q)
  if (p.month) u.set('month', p.month)
  const s = u.toString()
  return s ? `${path}?${s}` : path
}

/** '050-123 4567' → '%0%5%0%1%2%3%4%5%6%7%' — matches the number however it was stored. */
function phonePattern(term: string): string | null {
  const digits = term.replace(/\D/g, '')
  return digits.length >= 3 ? `%${digits.split('').join('%')}%` : null
}

/** '₪1,250.50' → 1250.5 */
function parseAmount(term: string): number | null {
  const clean = term.replace(/[₪,\s]/g, '')
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null
}

/** Value safe inside a PostgREST or() list. */
const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`

interface Cols {
  name?: string[]     // names, contact persons, descriptions
  phone?: string[]
  invoice?: string[]  // invoice / doc / check numbers
  amount?: string[]
  plate?: string[]
  other?: string[]    // searched only under "all" (email, sku, notes…)
}

/**
 * The or() filters for one table. Text columns are matched word by word (every word must appear —
 * one or() per word, ANDed together). Returns null when the chosen field doesn't apply to this table.
 */
function filtersFor(cols: Cols, term: string, field: SearchField): string[] | null {
  const words  = likePatterns(term)
  const phone  = phonePattern(term)
  const amount = parseAmount(term)

  const text = (list: string[]) => words.length ? words.map(w => list.map(c => `${c}.ilike.${quote(w)}`).join(',')) : null
  const phoneOr = (list: string[]) => (phone ? list.map(c => `${c}.ilike.${quote(phone)}`) : [])
  const amountOr = (list: string[]) => (amount != null ? list.map(c => `${c}.eq.${amount}`) : [])

  switch (field) {
    case 'name':    return cols.name    ? text(cols.name) : null
    case 'plate':   return cols.plate   ? text(cols.plate) : null
    case 'invoice': return cols.invoice ? text(cols.invoice) : null
    case 'phone':   return cols.phone && phone ? [phoneOr(cols.phone).join(',')] : null
    case 'amount':  return cols.amount && amount != null ? [amountOr(cols.amount).join(',')] : null
    case 'all': {
      const textCols = [...(cols.name ?? []), ...(cols.plate ?? []), ...(cols.invoice ?? []), ...(cols.other ?? []), ...(cols.phone ?? [])]
      // Single word: one or() over every column, plus phone/amount matches
      if (words.length <= 1) {
        const parts = [
          ...(words[0] ? textCols.map(c => `${c}.ilike.${quote(words[0])}`) : []),
          ...phoneOr(cols.phone ?? []),
          ...amountOr(cols.amount ?? []),
        ]
        return parts.length ? [parts.join(',')] : null
      }
      // Several words: each word must appear in some text column
      return text(textCols)
    }
  }
}

type Q = ReturnType<SupabaseClient['from']>

/** Applies the filters to a select; null when this table is skipped. */
function build(sb: SupabaseClient, table: string, select: string, cols: Cols, term: string, field: SearchField, order?: string) {
  const ors = filtersFor(cols, term, field)
  if (!ors) return null
  let q = (sb.from(table) as Q).select(select) as ReturnType<Q['select']>
  for (const o of ors) q = q.or(o)
  if (order) q = q.order(order, { ascending: false })
  return q.limit(LIMIT)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export async function runGlobalSearch(sb: SupabaseClient, term: string, field: SearchField, kind: SearchKind): Promise<SearchResult[]> {
  const want = (k: SearchKind) => kind === 'all' || kind === k

  // Tires: a Hebrew brand name finds that brand's tires too
  let heBrands: string[] = []
  if (want('stock') && (field === 'all' || field === 'name')) {
    const { data } = await sb.from('tire_brands').select('name_en, name_he')
    heBrands = brandsMatchingHe(data, term)
  }

  const jobs: { q: ReturnType<typeof build> | PromiseLike<{ data: Row[] | null }> | null; map: (r: Row) => SearchResult }[] = []
  const add = (q: (typeof jobs)[number]['q'], map: (r: Row) => SearchResult) => { if (q) jobs.push({ q, map }) }

  if (want('contacts')) {
    add(build(sb, 'customers', 'id, name, phone, contact_name, email', { name: ['name', 'contact_name'], phone: ['phone'], other: ['email'] }, term, field),
      r => ({ key: `cus-${r.id}`, icon: '👤', category: 'לקוח', primary: r.name, secondary: join(r.contact_name && `איש קשר: ${r.contact_name}`, r.phone, r.email), href: link('/contacts', { open: r.id }) }))
    add(build(sb, 'suppliers', 'id, name, phone, contact_name, email', { name: ['name', 'contact_name'], phone: ['phone'], other: ['email'] }, term, field),
      r => ({ key: `sup-${r.id}`, icon: '🏭', category: 'ספק', primary: r.name, secondary: join(r.contact_name && `איש קשר: ${r.contact_name}`, r.phone, r.email), href: link('/contacts', { open: r.id }) }))
  }

  if (want('invoices')) {
    add(build(sb, 'customer_ledger_debts', 'id, customer_id, doc_number, amount, date, description, plate, customers(name)',
      { invoice: ['doc_number'], amount: ['amount'], plate: ['plate'], other: ['description'] }, term, field, 'date'),
      r => ({ key: `cld-${r.id}`, icon: '🧾', category: 'חשבונית לקוח', primary: join(r.doc_number ? `חשבונית ${r.doc_number}` : (r.description || 'חיוב'), r.customers?.name),
        secondary: join(ils(r.amount), fmtDate(r.date), r.plate), href: link('/accounts', { tab: 'customers', open: r.customer_id, q: r.doc_number || r.description }) }))
    add(build(sb, 'supplier_debts', 'id, supplier_id, doc_number, amount, date, description, suppliers(name)',
      { invoice: ['doc_number'], amount: ['amount'], other: ['description'] }, term, field, 'date'),
      r => ({ key: `sd-${r.id}`, icon: '🧾', category: 'חשבונית ספק', primary: join(r.doc_number ? `חשבונית ${r.doc_number}` : (r.description || 'חיוב'), r.suppliers?.name),
        secondary: join(ils(r.amount), fmtDate(r.date)), href: link('/accounts', { tab: 'suppliers', open: r.supplier_id, q: r.doc_number || r.description }) }))
    add(build(sb, 'customer_debts', 'id, name, phone, plate, amount, date, description',
      { name: ['name'], phone: ['phone'], plate: ['plate'], amount: ['amount'], other: ['description'] }, term, field, 'date'),
      r => ({ key: `cd-${r.id}`, icon: '💳', category: 'חוב מזדמן', primary: r.name, secondary: join(ils(r.amount), r.phone, r.plate, fmtDate(r.date)), href: `/debts?focus=${r.id}` }))
  }

  if (want('money')) {
    add(build(sb, 'expenses', 'id, description, category, amount, date, payment_ref',
      { name: ['description'], amount: ['amount'], invoice: ['payment_ref'], other: ['category'] }, term, field, 'date'),
      r => ({ key: `exp-${r.id}`, icon: '💰', category: 'הוצאה', primary: r.description || r.category || 'הוצאה', secondary: join(ils(r.amount), fmtDate(r.date), r.payment_ref && `אסמכתא ${r.payment_ref}`),
        href: link('/expenses', { q: r.description || r.category, month: r.date?.slice(0, 7) }) }))
    add(build(sb, 'income', 'id, description, category, amount, date, payment_ref',
      { name: ['description'], amount: ['amount'], invoice: ['payment_ref'], other: ['category'] }, term, field, 'date'),
      r => ({ key: `inc-${r.id}`, icon: '💵', category: 'הכנסה', primary: r.description || r.category || 'הכנסה', secondary: join(ils(r.amount), fmtDate(r.date), r.payment_ref && `אסמכתא ${r.payment_ref}`),
        href: link('/income', { q: r.description || r.category, month: r.date?.slice(0, 7) }) }))
    add(build(sb, 'scheduled_payments', 'id, description, amount, due_date, check_number, is_paid',
      { name: ['description'], amount: ['amount'], invoice: ['check_number'], other: ['notes'] }, term, field, 'due_date'),
      r => ({ key: `chk-${r.id}`, icon: '📄', category: "צ'ק / תשלום", primary: join(r.check_number ? `צ'ק ${r.check_number}` : null, r.description) || 'תשלום',
        secondary: join(ils(r.amount), r.due_date && `פירעון ${fmtDate(r.due_date)}`, r.is_paid ? 'שולם' : null), href: link('/checks', { open: r.id }) }))
  }

  if (want('cars')) {
    add(build(sb, 'cars', 'id, plate, make, model, owner_name, buyer_name, buyer_phone',
      { plate: ['plate'], name: ['owner_name', 'buyer_name'], phone: ['buyer_phone'], other: ['make', 'model', 'car_code'] }, term, field),
      r => ({ key: `car-${r.id}`, icon: '🚗', category: 'רכב', primary: join(r.make, r.model, r.plate).replace(/ · /g, ' '), secondary: join(r.owner_name, r.buyer_name, r.buyer_phone), href: link('/cars', { open: r.id }) }))
    add(build(sb, 'car_inspections', 'id, plate, make, model, owner_name, owner_phone, date, inspection_number',
      { plate: ['plate'], name: ['owner_name'], phone: ['owner_phone'], invoice: ['inspection_number'], other: ['make', 'model'] }, term, field, 'date'),
      r => ({ key: `ins-${r.id}`, icon: '📝', category: 'בדיקה', primary: join(r.plate, r.make, r.model).replace(/ · /g, ' '), secondary: join(r.owner_name, r.owner_phone, fmtDate(r.date)), href: link('/inspections', { q: r.plate }) }))
  }

  if (want('stock') && (field === 'all' || field === 'name')) {
    add(build(sb, 'products', 'id, name, sku, barcode', { name: ['name'], other: ['sku', 'barcode'] }, term, field),
      r => ({ key: `prd-${r.id}`, icon: '📦', category: 'מוצר', primary: r.name, secondary: r.sku ?? undefined, href: link('/products', { q: r.sku || r.name }) }))
    const tireOr = [...likePatterns(term).flatMap(w => [`brand.ilike.${quote(w)}`, `sku.ilike.${quote(w)}`]), ...heBrands.map(b => `brand.ilike.${quote(b)}`)]
    if (tireOr.length)
      add(sb.from('tires').select('id, brand, width, profile, rim, sku').or(tireOr.join(',')).limit(LIMIT),
        r => ({ key: `tir-${r.id}`, icon: '🏁', category: 'צמיג', primary: `${r.brand ?? ''} ${tireSizeText(r) || 'ללא מידה'}`.trim(), secondary: r.sku ?? undefined, href: link('/tires', { q: r.sku || r.brand }) }))
  }

  if (want('employees')) {
    add(build(sb, 'employees', 'id, full_name, phone, email', { name: ['full_name'], phone: ['phone'], other: ['email'] }, term, field),
      r => ({ key: `emp-${r.id}`, icon: '👷', category: 'עובד', primary: r.full_name, secondary: join(r.phone, r.email), href: link('/employees', { open: r.id }) }))
  }

  const settled = await Promise.all(jobs.map(j => Promise.resolve(j.q).then(res => ({ res, map: j.map }), () => null)))
  const out: SearchResult[] = []
  for (const s of settled) {
    const data = (s?.res as { data?: Row[] | null } | undefined)?.data
    data?.forEach(r => out.push(s!.map(r)))
  }
  return out
}
