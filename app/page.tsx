import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
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
}

const DEFAULT_SERVICES = [
  { id: '1', icon: '🔧', name: 'תיקון ומכירת צמיגים', description: 'כל מותגי הצמיגים המובילים במחירים תחרותיים', image_url: null },
  { id: '2', icon: '🚗', name: 'כיוון פרונט', description: 'כיוון מדויק ממוחשב לכל סוגי הרכבים', image_url: null },
  { id: '3', icon: '🔍', name: 'בדיקת רכב לפני קניה', description: 'בדיקה מקיפה לפני רכישת רכב יד 2', image_url: null },
  { id: '4', icon: '🏷️', name: 'סוכנות רכב יד 2', description: 'קניה ומכירה של רכבים משומשים באמינות מלאה', image_url: null },
]

export default async function LandingPage() {
  const service = createServiceClient()
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  // Fetch tenant info + landing data in parallel
  const [{ data: tenant }, { data: services }, { data: promotions }, { data: priceItems }] = await Promise.all([
    service.from('tenants').select('name,sub_title,phone,address,logo_base64,public_info').eq('id', TENANT_ID).single(),
    supabase.from('services').select('id,name,description,icon,image_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('sort_order'),
    supabase.from('promotions').select('id,title,description,image_url,link_url,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).lte('start_date', today).or('end_date.is.null,end_date.gte.' + today).order('sort_order'),
    supabase.from('price_list').select('id,category,service_name,price,price_note,sort_order').eq('tenant_id', TENANT_ID).eq('is_active', true).order('category').order('sort_order'),
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
  }

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

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {BUSINESS.wazeUrl && (
              <a href={BUSINESS.wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#00c4ff', color: '#fff', border: 'none',
                borderRadius: '12px', padding: '12px 24px',
                fontWeight: 700, fontSize: '16px', textDecoration: 'none',
                boxShadow: '0 2px 10px rgba(0,196,255,.35)',
              }}>
                🧭 Waze
              </a>
            )}
            {BUSINESS.mapsUrl && (
              <a href={BUSINESS.mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#34a853', color: '#fff', border: 'none',
                borderRadius: '12px', padding: '12px 24px',
                fontWeight: 700, fontSize: '16px', textDecoration: 'none',
                boxShadow: '0 2px 10px rgba(52,168,83,.35)',
              }}>
                🗺️ Google Maps
              </a>
            )}
          </div>

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

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href="#services" style={heroBtnSt('#F5C800', '#1a2a6c')}>
              השירותים שלנו
            </a>
            <a href="#customer-area" style={heroBtnSt('transparent', '#fff', '2px solid rgba(255,255,255,.4)')}>
              מצא את הרכב שלי
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SERVICES
      ══════════════════════════════════════════════════════ */}
      <section id="services" style={{ background: '#f8fafc', padding: '80px 40px' }} aria-labelledby="services-title">
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
        <section style={{ background: '#f8fafc', padding: '80px 40px' }} aria-labelledby="prices-title">
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
            מצא את הרכב שלך
          </h2>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '15px', marginBottom: '32px' }}>
            הזן את מספר הלוחית ו-4 הספרות האחרונות של הטלפון שמסרת – ותוכל לעקוב אחרי סטטוס הרכב שלך בזמן אמת.
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

function heroBtnSt(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    display: 'inline-block',
    background: bg,
    color,
    border: border ?? 'none',
    borderRadius: '10px',
    padding: '14px 28px',
    fontWeight: 700,
    fontSize: '15px',
    textDecoration: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

