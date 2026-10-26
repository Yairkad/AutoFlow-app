import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'
import { loadBusiness } from '@/lib/landing/business'
import { fetchGoogleReviews, writeReviewUrl, allReviewsUrl } from '@/lib/landing/googleReviews'
import SiteHeader from '@/components/landing/SiteHeader'
import ContactFab from '@/components/landing/ContactFab'
import SiteFooter from '@/components/landing/SiteFooter'
import ServiceGallery from '@/components/landing/ServiceGallery'
import PromotionsCarousel from '@/components/landing/PromotionsCarousel'
import { Icon, Star, Sparkle, QuoteMark, WazeLogo, MapsPin } from '@/components/landing/icons'
import '@/components/landing/site.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'אוטו ליין – מרכז שירותי רכב',
  description: 'תיקון ומכירת צמיגים, כיוון פרונט, בדיקות רכב לפני קניה ומכירת רכבים יד 2. שירות מקצועי ומהיר.',
}

const TENANT_ID = LANDING_TENANT_ID

const DEFAULT_SERVICES = [
  { id: '1', name: 'פנצריה וצמיגים', description: 'תיקון תקרים, החלפה ואיזון, וכל המותגים המובילים', image_url: null },
  { id: '2', name: 'כיוון פרונט', description: 'כיוון ממוחשב מדויק לכל סוגי הרכבים', image_url: null },
  { id: '3', name: 'בדיקה לפני קניה', description: 'בדיקה מקיפה לרכב יד 2 לפני שסוגרים עסקה', image_url: null },
  { id: '4', name: 'מכירת רכב', description: 'רכבים יד 2 שנבדקו אצלנו לפני המכירה', image_url: null },
]

export default async function LandingPage() {
  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [business, { data: services }, { data: promotions }, { data: priceItems }, { data: faqItems }, { count: carCount }] = await Promise.all([
    loadBusiness(),
    service.from('services').select('id,name,description,image_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('sort_order'),
    service.from('promotions').select('id,title,description,fine_print,image_url,link_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).lte('start_date', today).or('end_date.is.null,end_date.gte.' + today).order('sort_order'),
    service.from('price_list').select('id,category,service_name,price,price_note,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('category').order('sort_order'),
    service.from('faq').select('id,question,answer,image_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('sort_order'),
    service.from('cars').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID).in('status', ['available', 'reserved']),
  ])
  const reviews = business.placeId ? await fetchGoogleReviews(business.placeId) : null

  const B = business
  const displayServices = services && services.length > 0 ? services : DEFAULT_SERVICES
  const faq = faqItems ?? []
  const hours = B.hours.split('|').map(s => s.trim()).filter(Boolean)
  const mapSrc = B.address ? `https://maps.google.com/maps?q=${encodeURIComponent(B.address)}&z=16&output=embed` : ''

  const links = [
    { href: '#services', label: 'שירותים' },
    ...(B.intakeHref ? [{ href: B.intakeHref, label: 'בדיקות קניה' }] : []),
    { href: '/for-sale', label: 'רכבים למכירה' },
    ...(faq.length ? [{ href: '#faq', label: 'שאלות נפוצות' }] : []),
    { href: '#contact', label: 'צור קשר' },
  ]

  return (
    <div className="al-site" dir="rtl">
      <SiteHeader name={B.name} logo={B.logo} phone={B.phone} links={links} />

      <main>
      <section className="al-hero" aria-labelledby="al-hero-title">
        {B.heroImage && <div className="al-hero-photo" style={{ backgroundImage: `url("${B.heroImage}")` }} aria-hidden="true" />}
        <div className="al-wrap">
          <div className="al-hero-body">
            <h1 id="al-hero-title">{B.tagline}<br />צמיגים, פרונט ובדיקות לפני קניה</h1>
            <p>עבודה מקצועית ומדויקת, מחירים הוגנים ושירות אישי.</p>
          </div>
        </div>
        <Sparkle size={22} color="#F1DE3C" style={{ top: 120, right: '12%' }} />
        <Sparkle size={14} color="#ffffff" style={{ top: 250, left: '14%' }} />
      </section>

      <div className="al-wrap">
        <div className="al-info">
          <div>
            <Icon name="clock" size={120} stroke={1.6} className="al-bg-ic" />
            <span className="al-label">שעות פעילות</span>
            {hours.length > 0
              ? <>{<strong>{hours[0]}</strong>}{hours.slice(1).map(h => <span key={h}>{h}</span>)}</>
              : <strong>לפרטים התקשרו</strong>}
          </div>
          <div>
            <Icon name="pin" size={120} stroke={1.6} className="al-bg-ic" />
            <span className="al-label">כתובת</span>
            <strong>{B.address || '—'}</strong>
            {(B.wazeUrl || B.mapsUrl) && (
              <div className="al-tile-btns">
                {B.wazeUrl && <a href={B.wazeUrl} target="_blank" rel="noopener noreferrer" className="is-nav"><WazeLogo />Waze</a>}
                {B.mapsUrl && <a href={B.mapsUrl} target="_blank" rel="noopener noreferrer" className="is-nav"><MapsPin />Google Maps</a>}
              </div>
            )}
          </div>
          <div>
            <Icon name="phone" size={120} stroke={1.6} className="al-bg-ic" />
            <span className="al-label">טלפון</span>
            <strong className="al-ltr">{B.phone || '—'}</strong>
            {B.phone && (
              <div className="al-tile-btns">
                <a href={`tel:${B.phone}`} className="is-call"><Icon name="phone" size={17} />חייגו עכשיו</a>
                {B.waHref && <a href={B.waHref} target="_blank" rel="noopener noreferrer" className="is-wa"><Icon name="wa" size={17} />וואטסאפ</a>}
              </div>
            )}
          </div>
        </div>
      </div>

        <section id="services" className="al-section al-after-hero"aria-labelledby="al-services-title">
          <div className="al-wrap">
            <div className="al-sec-title"><h2 id="al-services-title">השירותים שלנו</h2></div>
            <ServiceGallery
              services={displayServices}
              prices={priceItems ?? []}
              intakeHref={B.intakeHref}
              carsHref={(carCount ?? 0) > 0 ? '/for-sale' : null}
            />
          </div>
        </section>

        {(promotions ?? []).length > 0 && (
          <section className="al-section" style={{ paddingTop: 0 }} aria-labelledby="al-promos-title">
            <div className="al-wrap al-promo">
              <div className="al-sec-title" style={{ marginBottom: 32 }}><h2 id="al-promos-title">מבצעים</h2></div>
              <PromotionsCarousel promotions={promotions ?? []} />
            </div>
          </section>
        )}

        {faq.length > 0 && (
          <section id="faq" className="al-section" style={{ paddingTop: 0, paddingBottom: 96 }} aria-labelledby="al-faq-title">
            <div className="al-wrap al-faq">
              <div className="al-sec-title"><h2 id="al-faq-title">שאלות נפוצות</h2></div>
              <div className="al-panel">
                {faq.map((f, i) => (
                  <details key={f.id} open={i === 0}>
                    <summary>{f.question}<Icon name="chev" size={18} /></summary>
                    <p>{f.answer}</p>
                    {f.image_url && <img src={f.image_url} alt="" loading="lazy" />}
                  </details>
                ))}
              </div>
              <Link href="/guide" className="al-center-link">למדריך הצמיגים המלא ←</Link>
            </div>
          </section>
        )}

        {reviews && reviews.reviews.length > 0 && (
          <section id="reviews" className="al-reviews" aria-labelledby="al-reviews-title">
            <Sparkle size={20} color="#F1DE3C" style={{ top: 150, left: '18%' }} />
            <div className="al-wrap">
              <div className="al-stars" role="img" aria-label="דירוג כוכבים" style={{ marginBottom: 12 }}>
                {[0, 1, 2, 3, 4].map(i => <Star key={i} size={24} />)}
              </div>
              <div className="al-sec-title"><h2 id="al-reviews-title">מה הלקוחות אומרים עלינו</h2></div>
              {reviews.rating != null && (
                <p className="al-rating"><b>{reviews.rating.toFixed(1)}</b> מתוך 5{reviews.total ? ` · ${reviews.total.toLocaleString('he-IL')} ביקורות בגוגל` : ''}</p>
              )}
              <div className="al-rv-viewport">
                {/* the set is rendered twice so the auto-scroll loops without a jump */}
                <div className="al-rv-track">
                  {[...reviews.reviews, ...reviews.reviews].map((r, i) => (
                    <figure key={i} className="al-rv" aria-hidden={i >= reviews.reviews.length || undefined}>
                      <div className="al-stars" role="img" aria-label={`${r.rating} כוכבים`}>
                        {Array.from({ length: Math.round(r.rating) }, (_, k) => <Star key={k} size={15} />)}
                      </div>
                      <blockquote>{r.text}</blockquote>
                      <hr />
                      <figcaption><span><b>{r.author}</b><small>{r.when} · Google</small></span><QuoteMark /></figcaption>
                    </figure>
                  ))}
                </div>
              </div>
              <div className="al-rv-actions">
                <a href={writeReviewUrl(B.placeId)} target="_blank" rel="noopener noreferrer" className="al-btn al-btn-yellow"><Icon name="pen" size={17} />דרגו את החוויה שלכם</a>
                <a href={allReviewsUrl(B.placeId)} target="_blank" rel="noopener noreferrer" className="al-btn al-btn-ghost-w">לכל הביקורות בגוגל</a>
              </div>
            </div>
          </section>
        )}

        <section id="contact" className="al-section" style={{ paddingTop: 90, paddingBottom: 96 }} aria-labelledby="al-contact-title">
          <div className="al-wrap">
            <div className="al-panel al-contact">
              <div className="al-contact-info">
                <h2 id="al-contact-title">צור קשר והגעה</h2>
                <dl>
                  {B.address && <div><dt>כתובת</dt><dd>{B.address}</dd></div>}
                  {B.phone && <div><dt>טלפון</dt><dd className="al-ltr">{B.phone}</dd></div>}
                  {B.hours && <div><dt>שעות פעילות</dt><dd>{hours.join(' · ')}</dd></div>}
                  {B.email && <div><dt>מייל</dt><dd><a href={`mailto:${B.email}`}>{B.email}</a></dd></div>}
                </dl>
                <div className="al-contact-btns">
                  {B.wazeUrl && <a href={B.wazeUrl} target="_blank" rel="noopener noreferrer" className="al-btn al-btn-ghost-n"><WazeLogo size={20} />ניווט ב-Waze</a>}
                  {B.mapsUrl && <a href={B.mapsUrl} target="_blank" rel="noopener noreferrer" className="al-btn al-btn-ghost-n"><MapsPin size={18} />Google Maps</a>}
                </div>
              </div>
              {mapSrc && <iframe className="al-map" src={mapSrc} title={`מפה: ${B.address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter name={B.name} logo={B.logo} />
      <ContactFab phone={B.phone} waHref={B.waHref} />
    </div>
  )
}
