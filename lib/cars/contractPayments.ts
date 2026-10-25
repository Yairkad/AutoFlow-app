// Following up the buyer's payments of signed car sale contracts: every cash / transfer line and
// every check is an expected payment until someone marks it. Marks live in car_sale_contracts.receipts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeContract, parseAmount, type ContractData, type ContractParty } from './saleContract'

export type ReceiptStatus =
  | 'received'   // cash / transfer arrived (also "at signing" lines — confirmed by hand)
  | 'cleared'    // check cleared in the bank
  | 'swapped'    // check swapped for cash / transfer on its date (check goes back to the buyer)
  | 'bounced'    // check bounced — still open

export interface Receipt {
  status: ReceiptStatus
  at: string        // yyyy-mm-dd
  how?: 'cash' | 'transfer'   // swapped: what replaced the check
  note?: string
  by?: string | null
}

export type Receipts = Record<string, Receipt>

export interface ContractPayRow {
  id: string
  plate: string | null
  car_desc: string | null
  buyer_name: string | null
  contract_date: string | null
  data: ContractData
  receipts: Receipts | null
}

export interface ExpectedPayment {
  key: string                 // receipts key: 'l:<lineId>' | 'c:<checkId or position>'
  contractId: string
  buyer: string
  phone: string
  car: string
  kind: 'cash' | 'transfer' | 'check'
  checkNum: string
  amount: number
  due: string                 // yyyy-mm-dd ('' only if the contract has no date either)
  atSigning: boolean          // no date of its own = paid at signing
  receipt: Receipt | null
}

export const RECEIPT_LABEL: Record<ReceiptStatus, string> = {
  received: '✓ התקבל', cleared: '✓ נפרע', swapped: '🔁 הוחלף', bounced: '↩ חזר',
}
export const KIND_LABEL = { cash: 'מזומן', transfer: 'העברה', check: 'שיק' } as const

/** Done = nothing more to expect. A bounced check is still owed. */
export const isSettled = (p: ExpectedPayment) => !!p.receipt && p.receipt.status !== 'bounced'

const sameParty = (a: ContractParty, me: Partial<ContractParty> | null) =>
  !!me && ((!!me.idNum?.trim() && a.idNum.trim() === me.idNum.trim()) || (!!me.name?.trim() && a.name.trim() === me.name.trim()))

/**
 * Payments the buyer owes us, from signed contracts. A contract where we are the buyer
 * ("הפרטים שלי" filled into the buyer side) is skipped — that money goes out, not in.
 */
export function expectedPayments(rows: ContractPayRow[], me: Partial<ContractParty> | null): ExpectedPayment[] {
  const out: ExpectedPayment[] = []
  for (const r of rows) {
    if (!r.data) continue
    const d = normalizeContract(r.data)
    if (sameParty(d.buyer, me)) continue
    const rec = r.receipts ?? {}
    const base = {
      contractId: r.id,
      buyer: d.buyer.name || r.buyer_name || 'קונה',
      phone: d.buyer.phone,
      car: [r.plate || d.car.plate, r.car_desc || d.car.model].filter(Boolean).join(' · '),
    }
    const signedOn = d.date || r.contract_date || ''
    for (const l of d.payLines) {
      const amount = parseAmount(l.amount)
      if (!amount) continue
      const key = 'l:' + l.id
      out.push({ ...base, key, kind: l.kind, checkNum: '', amount, due: l.date || signedOn, atSigning: !l.date, receipt: rec[key] ?? null })
    }
    if (d.checksOn) d.checks.forEach((c, i) => {
      const amount = parseAmount(c.amount)
      if (!amount) return
      const key = 'c:' + (c.id ?? i)
      out.push({ ...base, key, kind: 'check', checkNum: c.num, amount, due: c.date || signedOn, atSigning: !c.date, receipt: rec[key] ?? null })
    })
  }
  return out.sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
}

export function daysFromToday(iso: string): number {
  if (!iso) return 0
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000)
}

/** Signed contracts' expected payments for this tenant. `missing` = migration 103 not run yet. */
export async function loadExpectedPayments(sb: SupabaseClient, tenantId: string): Promise<{ items: ExpectedPayment[]; missing: boolean }> {
  const [cRes, sRes] = await Promise.all([
    sb.from('car_sale_contracts').select('id, plate, car_desc, buyer_name, contract_date, data, receipts')
      .eq('tenant_id', tenantId).eq('status', 'signed').limit(1000),
    sb.from('car_contract_settings').select('seller').eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (cRes.error) return { items: [], missing: /receipts/.test(cRes.error.message) }
  return { items: expectedPayments((cRes.data ?? []) as ContractPayRow[], (sRes.data?.seller as ContractParty | null) ?? null), missing: false }
}

/** Set (or clear, with null) the mark of one payment. Re-reads the column so two people don't overwrite each other. */
export async function setReceipt(sb: SupabaseClient, contractId: string, key: string, receipt: Receipt | null): Promise<string | null> {
  const { data, error } = await sb.from('car_sale_contracts').select('receipts').eq('id', contractId).single()
  if (error) return error.message
  const next: Receipts = { ...((data?.receipts as Receipts | null) ?? {}) }
  if (receipt) next[key] = receipt; else delete next[key]
  const { error: upErr } = await sb.from('car_sale_contracts').update({ receipts: next }).eq('id', contractId)
  return upErr?.message ?? null
}
