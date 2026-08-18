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
      console.log('[DEBUG-PROFILE] load() started')
      const getUserRes = await sb.auth.getUser()
      console.log('[DEBUG-PROFILE] getUser result', JSON.stringify(getUserRes))
      const user = getUserRes.data.user
      if (!user) { console.log('[DEBUG-PROFILE] no user, stopping'); setProfile(null); setLoading(false); return }

      const profileRes = await sb.from('profiles')
        .select('full_name, tenant_id, role, allowed_modules')
        .eq('id', user.id)
        .single()
      console.log('[DEBUG-PROFILE] profiles result', JSON.stringify(profileRes))
      const p = profileRes.data

      if (!p) { console.log('[DEBUG-PROFILE] no profile row, stopping'); setProfile(null); setLoading(false); return }

      const tenantRes = await sb.from('tenants')
        .select('*')
        .eq('id', p.tenant_id)
        .single()
      console.log('[DEBUG-PROFILE] tenant result', JSON.stringify(tenantRes))
      const tenant = tenantRes.data

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
      console.log('[DEBUG-PROFILE] setProfile done')

      // Checks past their due_date are settled automatically — no manual "שולם" click needed.
      if (p.role === 'admin' || p.role === 'super_admin') {
        autoMarkOverdueChecksPaid(sb, p.tenant_id).catch(() => {})
      }
    } catch (err) {
      console.log('[DEBUG-PROFILE] THREW', String(err), (err as Error)?.stack)
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
