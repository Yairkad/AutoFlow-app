import { createClient } from '@/lib/supabase/client'

export type UiSettings = {
  sidebar_layout?: { label: string | null; hrefs: string[] }[]
  dashboard_layout?: Record<string, string>
}

/** Read ui_settings from the current user's tenant */
export async function loadUiSettings(): Promise<{ settings: UiSettings; tenantId: string } | null> {
  const sb = createClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user?.id) return null

  const { data: p } = await sb.from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle()
  if (!p?.tenant_id) return null

  const { data: t } = await sb.from('tenants')
    .select('ui_settings')
    .eq('id', p.tenant_id)
    .single()

  return { settings: (t?.ui_settings as UiSettings) ?? {}, tenantId: p.tenant_id }
}

/** Merge-update ui_settings for a tenant (partial update — other keys preserved) */
export async function saveUiSettings(tenantId: string, updates: Partial<UiSettings>): Promise<void> {
  const sb = createClient()

  // Read current, merge, write back
  const { data: t } = await sb.from('tenants')
    .select('ui_settings')
    .eq('id', tenantId)
    .single()

  const merged = { ...((t?.ui_settings as UiSettings) ?? {}), ...updates }
  await sb.from('tenants').update({ ui_settings: merged }).eq('id', tenantId)
}
