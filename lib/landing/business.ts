import { createServiceClient } from '@/lib/supabase/service'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'
import { waLink } from '@/lib/landing/wa'

// Business details shared by the public pages (home + /for-sale).

export interface PublicInfo {
  hours?: string
  waze_url?: string
  maps_url?: string
  email?: string
  hero_image?: string
  google_place_id?: string
}

export interface Business {
  name: string
  tagline: string
  phone: string
  address: string
  logo: string | null
  hours: string
  wazeUrl: string
  mapsUrl: string
  email: string
  heroImage: string | null
  placeId: string
  intakeHref: string | null
  waHref: string
}

export async function loadBusiness(): Promise<Business> {
  const { data: tenant } = await createServiceClient()
    .from('tenants')
    .select('name,sub_title,phone,address,logo_base64,public_info,intake_public_token')
    .eq('id', LANDING_TENANT_ID)
    .single()

  const pi = (tenant?.public_info ?? {}) as PublicInfo
  const phone = tenant?.phone ?? ''
  return {
    name:      tenant?.name ?? 'אוטו ליין',
    tagline:   tenant?.sub_title ?? 'מרכז שירותי רכב',
    phone,
    address:   tenant?.address ?? '',
    logo:      tenant?.logo_base64 ?? null,
    hours:     pi.hours ?? '',
    wazeUrl:   pi.waze_url ?? '',
    mapsUrl:   pi.maps_url ?? '',
    email:     pi.email ?? '',
    heroImage: pi.hero_image || null,
    placeId:   (pi.google_place_id ?? '').trim(),
    intakeHref: tenant?.intake_public_token ? `/intake/${tenant.intake_public_token}` : null,
    waHref:    waLink(phone, 'שלום, ברצוני לקבל מידע'),
  }
}
