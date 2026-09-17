'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { autoMarkOverdueChecksPaid } from '@/lib/utils/autoMarkOverdueChecks'

export interface TenantRow {
  id: string
  name: string | null
  sub_title: string | null
  phone: string | null
  address: string | null
  tax_id: string | null
  license_number: string | null
  logo_base64: string | null
  settings: Record<string, unknown> | null
  ui_settings: Record<string, unknown> | null
  public_info: Record<string, unknown> | null
  [key: string]: unknown
}

export interface Profile {
  userId: string
  email: string
  fullName: string | null
  tenantId: string
  role: string
  isAdmin: boolean
  allowedModules: string[]
  tenant: TenantRow | null
}

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refresh: async () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const sb = useRef(createClient()).current
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { user }, error: userErr } = await sb.auth.getUser()
      // A transient fetch failure (network hiccup, dev-server proxy/CORS race) surfaces here
      // the same way a genuine "no session" does — log it so it's distinguishable in the
      // console instead of silently looking like the user has no permissions (see bug-023).
      if (userErr) console.error('ProfileContext: auth.getUser() failed', userErr)
      if (!user) { setProfile(null); setLoading(false); return }

      const { data: p, error: profErr } = await sb.from('profiles')
        .select('full_name, tenant_id, role, allowed_modules')
        .eq('id', user.id)
        .single()
      if (profErr) console.error('ProfileContext: profiles fetch failed', profErr)

      if (!p) { setProfile(null); setLoading(false); return }

      const { data: tenant, error: tenantErr } = await sb.from('tenants')
        .select('*')
        .eq('id', p.tenant_id)
        .single()
      if (tenantErr) console.error('ProfileContext: tenants fetch failed', tenantErr)

      setProfile({
        userId: user.id,
        email: user.email ?? '',
        fullName: p.full_name ?? null,
        tenantId: p.tenant_id,
        role: p.role,
        isAdmin: p.role === 'admin' || p.role === 'super_admin',
        allowedModules: p.allowed_modules ?? [],
        tenant: (tenant as TenantRow) ?? null,
      })
      setLoading(false)

      // Checks past their due_date are settled automatically — no manual "שולם" click needed.
      if (p.role === 'admin' || p.role === 'super_admin') {
        autoMarkOverdueChecksPaid(sb, p.tenant_id).catch(() => {})
      }
    } catch (err) {
      // Unlike the checks above (an expected {error} result), this catches an actual thrown
      // exception (e.g. a raw network TypeError) — without this, loading gets stuck true
      // forever and the whole app shell hangs on its skeleton state.
      console.error('ProfileContext: load() threw', err)
      setLoading(false)
    }
  }, [sb])

  useEffect(() => { load() }, [load])

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh: load }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
