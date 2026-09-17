import { ColumnMapping } from '@/lib/bank-sync/parseStatementFile'

export interface BankSource {
  id: string
  tenant_id: string
  name: string
  column_mapping: ColumnMapping
  default_payment_method: string | null
  match_tolerance_days: number
  created_at: string
}

export interface BankImport {
  id: string
  tenant_id: string
  source_id: string | null
  file_name: string | null
  row_count: number
  imported_count: number
  created_at: string
}

export type LineStatus = 'unmatched' | 'matched' | 'created' | 'ignored'

export interface BankLine {
  id: string
  tenant_id: string
  import_id: string
  source_id: string | null
  row_index: number | null
  date: string
  description: string
  direction: 'debit' | 'credit'
  amount: number
  balance_after: number | null
  raw_row: unknown
  status: LineStatus
  matched_expense_id: string | null
  matched_income_id: string | null
  match_confidence: 'exact' | 'approx' | null
  ignored_reason: string | null
  reconciled_by: string | null
  reconciled_at: string | null
  created_at: string
}
