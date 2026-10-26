import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'
import { loadBusiness } from '@/lib/landing/business'
import SiteHeader from '@/components/landing/SiteHeader'
import SiteFooter from '@/components/landing/SiteFooter'
import ContactFab from '@/components/landing/ContactFab'
import CarsForSale from '@/components/landing/CarsForSale'
import '@/components/landing/site.css'

// Public catalog of cars for sale (the internal /cars route is the office module).

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'רכבים למכירה – אוטו ליין',
  description: 'רכבים יד 2 שנבדקו במוסך לפני המכירה.',
}

export default async function ForSalePage() {
  const [B, { data: cars }] = await Promise.all([
    loadBusiness(),
    createServiceClient()
      .from('cars')
      .select('id,make,model,year,km,fuel_type,color,ask_price,photos,status,seats,condition,notes')
      .eq('tenant_id', LANDING_TENANT_ID)
      .in('status', ['available', 'reserved'])
      .order('created_at', { ascending: false }),
  ])

  const list = (cars ?? []).map(c => ({
    ...c,
    photos:    Array.isArray(c.photos) ? c.photos : [],
    seats:     c.seats ?? null,
    condition: c.condition ?? null,
    notes:     c.notes ?? null,
  }))

  const links = [
    { href: '/#services', label: 'שירותים' },
    { href: '/for-sale', label: 'רכבים למכירה', current: true },
    { href: '/#contact', label: 'צור קשר' },
  ]

  return (
    <div className="al-site" dir="rtl">
      <SiteHeader name={B.name} logo={B.logo} phone={B.phone} links={links} />

      <section className="al-page-hero" aria-labelledby="al-sale-title">
        <div className="al-wrap">
          <nav className="al-crumbs" aria-label="פירורי לחם"><Link href="/">דף הבית</Link> / רכבים למכירה</nav>
          <h1 id="al-sale-title">רכבים למכירה</h1>
          <p>כל הרכבים נבדקו במוסך שלנו לפני המכירה</p>
        </div>
      </section>

      <CarsForSale cars={list} phone={B.phone} />

      <section className="al-wish" aria-labelledby="al-wish-title">
        <div className="al-wrap">
          <div><h2 id="al-wish-title">מחפשים רכב מסוים?</h2><p>ספרו לנו מה אתם מחפשים ונעדכן כשמגיע רכב מתאים.</p></div>
          {B.waHref && <a href={B.waHref} target="_blank" rel="noopener noreferrer" className="al-btn al-btn-yellow">דברו איתנו</a>}
        </div>
      </section>

      <SiteFooter name={B.name} logo={B.logo} address={B.address} phone={B.phone} />
      <ContactFab phone={B.phone} waHref={B.waHref} />
    </div>
  )
}
