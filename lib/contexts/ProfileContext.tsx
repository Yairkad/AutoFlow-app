'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

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
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setProfile(null); setLoading(false); return }

    const { data: p } = await sb.from('profiles')
      .select('full_name, tenant_id, role, allowed_modules')
      .eq('id', user.id)
      .single()

    if (!p) { setProfile(null); setLoading(false); return }

    const { data: tenant } = await sb.from('tenants')
      .select('*')
      .eq('id', p.tenant_id)
      .single()

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
