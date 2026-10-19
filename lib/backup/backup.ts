import type { SupabaseClient } from '@supabase/supabase-js'

// Full per-tenant data backup, shared by the manual export, "back up to Drive now" and the daily
// cron. Server-side only (service-role client) so it reads every row regardless of RLS.

export const BACKUP_VERSION = 2

// Restore order: parents before children, so foreign keys resolve on the first pass.
export const BACKUP_TABLES = [
  // lookups / catalogs
  'supplier_categories', 'customer_categories', 'expense_categories', 'income_categories',
  'services', 'yard_services', 'price_list', 'promotions', 'faq', 'bank_statement_sources',
  // main entities
  'suppliers', 'customers', 'employees', 'tires', 'products', 'cars',
  // everything that hangs off them
  'tire_sales', 'product_sales', 'alignment_jobs', 'recurring_items',
  'car_requests', 'car_sale_requests',
  'customer_debts', 'customer_debt_calls', 'customer_debt_payments',
  'customer_ledger_debts', 'customer_ledger_payments', 'customer_actions',
  'supplier_debts', 'supplier_debt_payments',
  'salaries', 'scheduled_payments', 'expenses', 'income', 'recurring_expenses',
  'quotes', 'car_inspections', 'reminders', 'documents', 'test_transfers',
  'bank_statement_imports', 'bank_statement_lines',
  'yard_sessions', 'yard_session_items',
  'tire_inventory_count_sessions',
] as const

// No tenant_id of its own — exported through its session ids.
export const CHILD_TABLES = { tire_inventory_count_entries: 'tire_inventory_count_sessions' } as const

// Saved for the record but never written back by a restore: profiles are tied to auth users,
// and the tenant row holds connection settings.
export const RECORD_ONLY = ['profiles', 'tenant'] as const

// Deliberately NOT backed up: vault_items (passwords / card numbers) and registration_tokens.
// Tenant credentials are stripped from the copy: *_token columns (Drive refresh token, the
// public intake link) and the vault PIN hash kept inside `settings`.
const SECRET_TENANT_COLUMN = /_token$|secret|password/i

function stripTenantSecrets(tenant: Record<string, unknown>) {
  const out = Object.fromEntries(Object.entries(tenant).filter(([k]) => !SECRET_TENANT_COLUMN.test(k)))
  if (out.settings && typeof out.settings === 'object') {
    const { vault_pin_hash: _omit, ...rest } = out.settings as Record<string, unknown>
    void _omit
    out.settings = rest
  }
  return out
}

const PAGE = 1000

async function readAll(sb: SupabaseClient, table: string, column: string, values: string | string[]) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').range(from, from + PAGE - 1)
    q = Array.isArray(values) ? q.in(column, values) : q.eq(column, values)
    const { data, error } = await q
    // Fail loudly: a silently empty table in a backup is worse than no backup.
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export interface Backup {
  _version: number
  _exported_at: string
  _tenant_id: string
  _counts: Record<string, number>
  [table: string]: unknown
}

export async function buildBackup(sb: SupabaseClient, tenantId: string): Promise<Backup> {
  const backup: Backup = { _version: BACKUP_VERSION, _exported_at: new Date().toISOString(), _tenant_id: tenantId, _counts: {} }

  for (const table of BACKUP_TABLES) backup[table] = await readAll(sb, table, 'tenant_id', tenantId)

  for (const [child, parent] of Object.entries(CHILD_TABLES)) {
    const ids = (backup[parent] as { id: string }[]).map(r => r.id)
    backup[child] = []
    for (let i = 0; i < ids.length; i += 200) {
      (backup[child] as unknown[]).push(...await readAll(sb, child, 'session_id', ids.slice(i, i + 200)))
    }
  }

  backup.profiles = await readAll(sb, 'profiles', 'tenant_id', tenantId)
  const { data: tenant, error } = await sb.from('tenants').select('*').eq('id', tenantId).maybeSingle()
  if (error) throw new Error(`tenants: ${error.message}`)
  backup.tenant = tenant ? stripTenantSecrets(tenant) : null

  for (const [k, v] of Object.entries(backup)) if (Array.isArray(v)) backup._counts[k] = v.length
  return backup
}

export function backupFileName(date = new Date()) {
  const d = date.toISOString()
  return `גיבוי_${d.slice(0, 10)}_${d.slice(11, 16).replace(':', '')}.json`
}

/** Records a successful backup on the tenant (drives the "no recent backup" reminder). */
export async function markBackup(sb: SupabaseClient, tenantId: string, kind: 'download' | 'drive' | 'auto') {
  await sb.from('tenants').update({ last_backup_at: new Date().toISOString(), last_backup_kind: kind, last_backup_error: null }).eq('id', tenantId)
}
