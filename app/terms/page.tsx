import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'תנאי שימוש – אוטוליין',
  description: 'תנאי השימוש של אוטוליין פנצריה ושירותי רכב',
}

const TENANT_ID = 'c618f567-139b-4ce9-ac77-67affe93c27d'
const UPDATED   = '18 במרץ 2026'

export default async function TermsPage() {
  const service = createServiceClient()
  const { data: tenant } = await service
    .from('tenants')
    .select('name,phone,address,public_info')
    .eq('id', TENANT_ID)
    .single()

  const name    = tenant?.name    ?? 'אוטוליין'
  const phone   = tenant?.phone   ?? ''
  const address = tenant?.address ?? ''
  const email   = (tenant?.public_info as { email?: string } | null)?.email ?? ''

  return (
    <div dir="rtl" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'var(--font-heebo, Heebo), sans-serif' }}>

      {/* ── Nav ── */}
      <header style={{ background: '#1a2a6c', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ color: '#F5C800', fontWeight: 800, fontSize: '20px', textDecoration: 'none', letterSpacing: '-0.5px' }}>
          {name}
        </Link>
        <Link href="/" style={{ color: '#fff', fontSize: '14px', opacity: 0.8, textDecoration: 'none' }}>
          ← חזרה לדף הבית
        </Link>
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#1a2a6c', marginBottom: '6px' }}>
          תנאי שימוש
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '40px' }}>
          עדכון אחרון: {UPDATED}
        </p>

        <Section title="1. כללי">
          תנאי שימוש אלו מסדירים את השימוש באתר ובשירות מעקב הרכב של <strong>{name}</strong>.
          השימוש באתר מהווה הסכמה לתנאים אלו במלואם. אם אינך מסכים – אנא הימנע מהשימוש באתר.
        </Section>

        <Section title="2. מטרת השירות">
          <p style={{ marginBottom: '10px' }}>האתר מציע:</p>
          <ul>
            <li><strong>מעקב סטטוס רכב</strong> – לקוח רשאי לבדוק את מצב הרכב שלו שנמצא בטיפול, באמצעות מספר לוחית ו-4 ספרות אחרונות של טלפונו.</li>
            <li><strong>מידע כללי</strong> – שירותי העסק, מחירון, קידומים ופרטי יצירת קשר.</li>
          </ul>
        </Section>

        <Section title="3. אחריות מוגבלת">
          <ul>
            <li>
              <strong>הסטטוס המוצג הוא אינפורמטיבי בלבד</strong> ואינו מהווה התחייבות חוזית לסיום הטיפול במועד מסוים.
              עיכובים עשויים להיגרם עקב חלקי חילוף, עומס עבודה, או גורמים חיצוניים.
            </li>
            <li>
              {name} לא יישא באחריות לנזק שייגרם עקב הסתמכות על הנתונים המוצגים באתר.
            </li>
            <li>
              האתר ניתן &quot;כמות שהוא&quot; (As-Is) ואנו שומרים הזכות לשנות, להשעות או להפסיק כל שירות בכל עת.
            </li>
          </ul>
        </Section>

        <Section title="4. שימוש מותר">
          <ul>
            <li>הגשת פניות בתום לב לבדיקת סטטוס רכב שבבעלותך או שאתה מורשה לשאול לגביו.</li>
            <li>קבלת מידע על שירותי העסק לצרכים אישיים בלבד.</li>
          </ul>
        </Section>

        <Section title="5. שימוש אסור">
          <p style={{ marginBottom: '10px' }}>חל <strong>איסור מוחלט</strong> על:</p>
          <ul>
            <li>ניסיון לדלות מידע על רכבים שאינם בבעלותך או שלא הרשית לך לברר לגביהם.</li>
            <li>הרצת סקריפטים אוטומטיים, בוטים, או כל כלי אחר לשאילתות מרובות (Scraping / Brute Force).</li>
            <li>ניסיון לעקוף מנגנוני אבטחה, להשבית את האתר, או לגרום נזק לתשתית.</li>
            <li>שימוש בפרטים שנחשפו לפגיעה בפרטיות של לקוחות אחרים.</li>
          </ul>
          <p style={{ marginTop: '10px' }}>
            הפרה של סעיף זה עלולה לגרור חסימת גישה ו/או נקיטת הליכים משפטיים.
          </p>
        </Section>

        <Section title="6. קניין רוחני">
          כל התכנים באתר – לרבות טקסטים, תמונות, לוגו ועיצוב – הם רכוש {name} ומוגנים בזכויות יוצרים.
          אין להעתיק, לשכפל או להפיץ תכנים ללא אישור מפורש בכתב.
        </Section>

        <Section title="7. פרטיות">
          השימוש באתר כפוף גם ל
          <Link href="/privacy" style={{ color: '#1a2a6c', fontWeight: 600 }}> מדיניות הפרטיות</Link> שלנו,
          המהווה חלק בלתי נפרד מתנאי שימוש אלו.
        </Section>

        <Section title="8. שינויים בתנאים">
          אנו שומרים הזכות לעדכן תנאים אלו בכל עת. המשך השימוש באתר לאחר פרסום שינויים מהווה הסכמה לתנאים המעודכנים.
        </Section>

        <Section title="9. דין וסמכות שיפוט">
          תנאי שימוש אלו כפופים לדין הישראלי. כל מחלוקת תידון בבתי המשפט המוסמכים בישראל.
        </Section>

        <Section title="10. יצירת קשר">
          <p style={{ marginBottom: '10px' }}>לשאלות בנוגע לתנאי שימוש אלו:</p>
          <ul>
            {phone   && <li><strong>טלפון:</strong> <a href={`tel:${phone}`}   style={{ color: '#1a2a6c' }}>{phone}</a></li>}
            {email   && <li><strong>דואר אלקטרוני:</strong> <a href={`mailto:${email}`} style={{ color: '#1a2a6c' }}>{email}</a></li>}
            {address && <li><strong>כתובת:</strong> {address}</li>}
          </ul>
        </Section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
            ← חזרה לדף הבית
          </Link>
          <Link href="/privacy" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
            מדיניות פרטיות
          </Link>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{
        fontSize: '17px', fontWeight: 700, color: '#1a2a6c',
        marginBottom: '12px', paddingBottom: '8px',
        borderBottom: '2px solid #F5C800',
      }}>
        {title}
      </h2>
      <div style={{ color: '#334155', lineHeight: 1.85, fontSize: '15px' }}>
        {children}
      </div>
    </section>
  )
}
