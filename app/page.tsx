import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import CustomerSearch from '@/components/landing/CustomerSearch'
import PromotionsCarousel from '@/components/landing/PromotionsCarousel'
import PriceList from '@/components/landing/PriceList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'אוטוליין – פנצריה ושירותי רכב',
  description: 'תיקון ומכירת צמיגים, כיוון פרונט, בדיקות רכב לפני קניה, סוכנות רכב יד 2. שירות מקצועי ומהיר.',
}

const TENANT_ID = 'c618f567-139b-4ce9-ac77-67affe93c27d'

type PublicInfo = {
  hours?: string
  waze_url?: string
  maps_url?: string
  email?: string
}

const DEFAULT_SERVICES = [
  { id: '1', icon: '🔧', name: 'תיקון ומכירת צמיגים', description: 'כל מותגי הצמיגים המובילים במחירים תחרותיים', image_url: null },
  { id: '2', icon: '🚗', name: 'כיוון פרונט', description: 'כיוון מדויק ממוחשב לכל סוגי הרכבים', image_url: null },
  { id: '3', icon: '🔍', name: 'בדיקת רכב לפני קניה', description: 'בדיקה מקיפה לפני רכישת רכב יד 2', image_url: null },
  { id: '4', icon: '🏷️', name: 'סוכנות רכב יד 2', description: 'קניה ומכירה של רכבים משומשים באמינות מלאה', image_url: null },
]

export default async function LandingPage() {
  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Fetch tenant info + landing data in parallel (all via service client – public page, no auth required)
  const [{ data: tenant }, { data: services }, { data: promotions }, { data: priceItems }] = await Promise.all([
    service.from('tenants').select('name,sub_title,phone,address,logo_base64,public_info').eq('id', TENANT_ID).single(),
    service.from('services').select('id,name,description,icon,image_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('sort_order'),
    service.from('promotions').select('id,title,description,fine_print,image_url,link_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).lte('start_date', today).or('end_date.is.null,end_date.gte.' + today).order('sort_order'),
    service.from('price_list').select('id,category,service_name,price,price_note,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('category').order('sort_order'),
  ])

  const pi = (tenant?.public_info ?? {}) as PublicInfo
  const BUSINESS = {
    name:     tenant?.name     ?? 'אוטוליין',
    tagline:  tenant?.sub_title ?? 'פנצריה ושירותי רכב',
    phone:    tenant?.phone    ?? '',
    address:  tenant?.address  ?? '',
    logo:     tenant?.logo_base64 ?? null,
    hours:    pi.hours    ?? '',
    wazeUrl:  pi.waze_url ?? '',
    mapsUrl:  pi.maps_url ?? '',
    email:    pi.email    ?? '',
  }
  // WhatsApp URL (compute server-side)
  const waPhone = BUSINESS.phone
    ? BUSINESS.phone.replace(/\D/g, '').replace(/^0/, '972')
    : ''
  const waHref = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent('שלום, ברצוני לקבל מידע')}` : ''

  const displayServices = services && services.length > 0 ? services : DEFAULT_SERVICES
  const displayPromotions = promotions ?? []
  const displayPrices = priceItems ?? []

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-heebo, Heebo), sans-serif', color: '#1e293b' }}>

      {/* Employee login – fixed top-left */}
      <Link
        href="/login"
        style={{
          position: 'fixed', top: '16px', left: '16px', zIndex: 100,
          background: 'rgba(26,42,108,.85)', backdropFilter: 'blur(6px)',
          color: '#F5C800', textDecoration: 'none',
          padding: '8px 16px', borderRadius: '8px',
          fontSize: '13px', fontWeight: 700,
          border: '1px solid rgba(245,200,0,.3)',
        }}
      >
        🔑 כניסת עובדים
      </Link>

      {/* ══════════════════════════════════════════════════════
          HERO – Split: yellow right / navy left
      ══════════════════════════════════════════════════════ */}
      <section className="landing-hero" aria-label="ראשי">

        {/* Right – Yellow panel */}
        <div className="landing-panel-yellow">
          {/* Logo */}
          {BUSINESS.logo ? (
            <img
              src={BUSINESS.logo}
              alt={`לוגו ${BUSINESS.name}`}
              style={{ width: 'min(420px, 100%)', height: 'auto', aspectRatio: '1/1', objectFit: 'contain', borderRadius: '16px' }}
            />
          ) : (
            <div style={{
              width: '420px', height: '420px',
              background: '#1a2a6c',
              borderRadius: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#F5C800', fontSize: '120px', fontWeight: 800,
              letterSpacing: '-4px',
            }} aria-label={`לוגו ${BUSINESS.name}`}>
              {BUSINESS.name.slice(0, 2)}
            </div>
          )}

          {/* Business info */}
          <div style={{ background: 'rgba(26,42,108,.08)', borderRadius: '14px', padding: '20px 24px', width: '100%', maxWidth: '320px' }}>
            {BUSINESS.phone && (
              <InfoRow icon="📞">
                <a href={`tel:${BUSINESS.phone}`} style={{ color: '#1a2a6c', fontWeight: 700, fontSize: '18px' }}>{BUSINESS.phone}</a>
              </InfoRow>
            )}
            {BUSINESS.address && (
              <InfoRow icon="📍">
                <span style={{ color: '#1a2a6c', fontWeight: 600 }}>{BUSINESS.address}</span>
              </InfoRow>
            )}
            {BUSINESS.hours && (
              <InfoRow icon="🕐">
                <span style={{ color: '#1a2a6c' }}>{BUSINESS.hours}</span>
              </InfoRow>
            )}
            {BUSINESS.email && (
              <InfoRow icon="✉️">
                <a href={`mailto:${BUSINESS.email}`} style={{ color: '#1a2a6c', fontWeight: 600, fontSize: '14px' }}>{BUSINESS.email}</a>
              </InfoRow>
            )}
          </div>

          {/* Contact buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '320px' }}>
            {BUSINESS.phone && (
              <a href={`tel:${BUSINESS.phone}`} style={{
                flex: 1, minWidth: '80px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: '#1a2a6c', color: '#fff', borderRadius: '10px', padding: '10px 14px',
                fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(26,42,108,.3)',
              }}>
                📞 שיחה
              </a>
            )}
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" style={{
                flex: 1, minWidth: '80px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: '#25d366', color: '#fff', borderRadius: '10px', padding: '10px 14px',
                fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(37,211,102,.3)',
              }}>
                💬 ווצאפ
              </a>
            )}
            {BUSINESS.email && (
              <a href={`mailto:${BUSINESS.email}`} style={{
                flex: 1, minWidth: '80px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: '#ea4335', color: '#fff', borderRadius: '10px', padding: '10px 14px',
                fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(234,67,53,.3)',
              }}>
                ✉️ מייל
              </a>
            )}
          </div>

          {/* Navigation buttons – smaller, below contact */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {BUSINESS.wazeUrl && (
              <a href={BUSINESS.wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#fff', color: '#1a1a1a', border: '1.5px solid #33CCFF',
                borderRadius: '10px', padding: '7px 16px',
                fontWeight: 700, fontSize: '13px', textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(51,204,255,.25)',
              }}>
                {/* Waze official logo colors */}
                <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="100" height="100" rx="22" fill="#33CCFF"/>
                  {/* body */}
                  <path d="M50 10C31.2 10 16 24.8 16 43c0 11.2 5.4 21.1 13.8 27.5l-1.4 3.5 3 5.5 7-3.5c3.5 1 7.2 1.5 11.6 1.5s8.1-.5 11.6-1.5l7 3.5 3-5.5-1.4-3.5C78.6 64.1 84 54.2 84 43 84 24.8 68.8 10 50 10z" fill="#fff"/>
                  {/* eyes */}
                  <circle cx="38" cy="41" r="6" fill="#33CCFF"/>
                  <circle cx="62" cy="41" r="6" fill="#33CCFF"/>
                  <circle cx="40" cy="39" r="2.5" fill="#fff"/>
                  <circle cx="64" cy="39" r="2.5" fill="#fff"/>
                  {/* smile */}
                  <path d="M36 55 Q50 65 64 55" stroke="#33CCFF" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
                  {/* wheels */}
                  <circle cx="36" cy="83" r="6" fill="#4d4d4d"/>
                  <circle cx="64" cy="83" r="6" fill="#4d4d4d"/>
                  <circle cx="36" cy="83" r="3" fill="#fff"/>
                  <circle cx="64" cy="83" r="3" fill="#fff"/>
                </svg>
                <span style={{ color: '#33CCFF' }}>Waze</span>
              </a>
            )}
            {BUSINESS.mapsUrl && (
              <a href={BUSINESS.mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#fff', color: '#3c4043', border: '1.5px solid #dadce0',
                borderRadius: '10px', padding: '7px 16px',
                fontWeight: 500, fontSize: '13px', textDecoration: 'none',
                boxShadow: '0 1px 6px rgba(0,0,0,.12)',
              }}>
                {/* Google Maps official pin with brand colors */}
                <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 4C15.16 4 8 11.16 8 20c0 12 16 28 16 28s16-16 16-28C40 11.16 32.84 4 24 4z" fill="#EA4335"/>
                  <path d="M24 4C15.16 4 8 11.16 8 20c0 3.8 1.2 7.3 3.2 10.2L28 6.2C26.7 4.8 25.4 4 24 4z" fill="#C5221F"/>
                  <circle cx="24" cy="20" r="7" fill="#fff"/>
                  {/* Google G colors inside pin */}
                  <path d="M24 15 A5 5 0 0 1 28.7 18 H24 V20 H30 C29.5 23 27 25 24 25 A5 5 0 1 1 24 15z" fill="#4285F4"/>
                </svg>
                <span>
                  <span style={{ color: '#4285F4', fontWeight: 700 }}>G</span>
                  <span style={{ color: '#EA4335', fontWeight: 700 }}>o</span>
                  <span style={{ color: '#FBBC04', fontWeight: 700 }}>o</span>
                  <span style={{ color: '#4285F4', fontWeight: 700 }}>g</span>
                  <span style={{ color: '#34A853', fontWeight: 700 }}>l</span>
                  <span style={{ color: '#EA4335', fontWeight: 700 }}>e</span>
                  <span style={{ color: '#3c4043', fontWeight: 500 }}> Maps</span>
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Left – Navy panel */}
        <div className="landing-panel-navy">
          <div>
            <p style={{ color: '#F5C800', fontWeight: 700, fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
              שירות מקצועי · מהיר · אמין
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, lineHeight: 1.2, margin: 0, letterSpacing: '-1.5px' }}>
              הרכב שלך<br />
              <span style={{ color: '#F5C800' }}>בידיים הטובות</span><br />
              ביותר
            </h2>
          </div>

          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '17px', lineHeight: 1.7, maxWidth: '480px', margin: 0 }}>
            מתמחים בטיפול מקצועי לרכב – מצמיגים ועד בדיקות מקיפות לפני קניה.
            שירות אדיב, מחירים הוגנים ועבודה מדויקת.
          </p>

          <div className="hero-actions">
            <a href="#services" className="hero-btn hero-btn-primary">
              השירותים שלנו
            </a>
            <a href="#customer-area" className="hero-btn hero-btn-secondary">
              מעקב סטטוס טיפול
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SERVICES
      ══════════════════════════════════════════════════════ */}
      <section id="services" style={{ background: '#fffde7', padding: '80px 40px' }} aria-labelledby="services-title">
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionHeader id="services-title" title="השירותים שלנו" sub="כל מה שהרכב שלך צריך – במקום אחד" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '40px' }}>
            {displayServices.map((s) => (
              <div key={s.id} style={cardSt}>
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '10px', marginBottom: '16px' }}
                  />
                ) : (
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>{s.icon ?? '🔧'}</div>
                )}
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a2a6c', margin: '0 0 8px' }}>{s.name}</h3>
                {s.description && <p style={{ fontSize: '14px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>{s.description}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PROMOTIONS
      ══════════════════════════════════════════════════════ */}
      {displayPromotions.length > 0 && (
        <section style={{ background: '#fff', padding: '80px 40px' }} aria-labelledby="promos-title">
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <SectionHeader id="promos-title" title="מבצעים חמים" sub="הצעות מיוחדות לתקופה מוגבלת" />
            <div style={{ marginTop: '40px' }}>
              <PromotionsCarousel promotions={displayPromotions} />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          PRICE LIST
      ══════════════════════════════════════════════════════ */}
      {displayPrices.length > 0 && (
        <section style={{ background: '#fffde7', padding: '80px 40px' }} aria-labelledby="prices-title">
          <div style={{ maxWidth: '780px', margin: '0 auto' }}>
            <SectionHeader id="prices-title" title="מחירון שירותים" sub="מחירים שקופים ללא הפתעות" />
            <div style={{ marginTop: '40px' }}>
              <PriceList items={displayPrices} />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          CUSTOMER AREA
      ══════════════════════════════════════════════════════ */}
      <section id="customer-area" style={{ background: '#1a2a6c', padding: '80px 40px' }} aria-labelledby="customer-title">
        <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: '#F5C800', fontWeight: 700, fontSize: '13px', letterSpacing: '2px', marginBottom: '12px' }}>
            איזור לקוחות
          </p>
          <h2 id="customer-title" style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: '0 0 10px' }}>
            מעקב סטטוס טיפול
          </h2>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '15px', marginBottom: '32px' }}>
            הזן את מספר הלוחית ו-4 הספרות האחרונות של הטלפון שמסרת – ותוכל לעקוב אחרי סטטוס טיפול הרכב שלך בזמן אמת.
          </p>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', textAlign: 'right' }}>
            <CustomerSearch />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer style={{ background: '#0f1e55', color: 'rgba(255,255,255,.7)', padding: '40px', textAlign: 'center' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontWeight: 800, fontSize: '20px', color: '#F5C800', marginBottom: '4px' }}>{BUSINESS.name}</p>
          {BUSINESS.address && <p style={{ fontSize: '14px', margin: '4px 0' }}>{BUSINESS.address}</p>}
          {BUSINESS.phone && (
            <p style={{ fontSize: '14px', margin: '4px 0' }}>
              טלפון: <a href={`tel:${BUSINESS.phone}`} style={{ color: '#fff' }}>{BUSINESS.phone}</a>
            </p>
          )}
          {BUSINESS.hours && <p style={{ fontSize: '14px', margin: '4px 0' }}>שעות פעילות: {BUSINESS.hours}</p>}

          <div style={{ borderTop: '1px solid rgba(255,255,255,.15)', marginTop: '24px', paddingTop: '20px', display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
            <Link href="/privacy" style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none' }}>מדיניות פרטיות</Link>
            <Link href="/terms" style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none' }}>תנאי שימוש</Link>
            <Link href="/accessibility" style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none' }}>הצהרת נגישות</Link>
            {BUSINESS.wazeUrl && <a href={BUSINESS.wazeUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none' }}>Waze</a>}
            {BUSINESS.mapsUrl && <a href={BUSINESS.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,.6)', textDecoration: 'none' }}>Google Maps</a>}
          </div>

          <p style={{ fontSize: '12px', marginTop: '16px', opacity: 0.4 }}>
            © {new Date().getFullYear()} {BUSINESS.name}. כל הזכויות שמורות.
          </p>
        </div>
      </footer>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ id, title, sub }: { id?: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 id={id} style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: '#1a2a6c', margin: '0 0 8px' }}>
        {title}
      </h2>
      {sub && <p style={{ color: '#64748b', fontSize: '16px', margin: 0 }}>{sub}</p>}
      <div style={{ width: '48px', height: '4px', background: '#F5C800', borderRadius: '2px', margin: '16px auto 0' }} />
    </div>
  )
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <div>{children}</div>
    </div>
  )
}

const cardSt: React.CSSProperties = {
  background: '#fff',
  borderRadius: '16px',
  padding: '28px 24px',
  boxShadow: '0 2px 12px rgba(0,0,0,.06)',
  border: '1px solid #e2e8f0',
  transition: 'transform 0.2s, box-shadow 0.2s',
}


