import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'הצהרת נגישות – אוטו ליין',
  description: 'הצהרת הנגישות של אוטו ליין פנצריה ושירותי רכב',
}

const UPDATED = '26 באוקטובר 2026'

export default async function AccessibilityPage() {
  const { data: tenant } = await createServiceClient()
    .from('tenants')
    .select('phone,address,public_info')
    .eq('id', LANDING_TENANT_ID)
    .single()
  const phone   = tenant?.phone   ?? ''
  const address = tenant?.address ?? ''
  const email   = (tenant?.public_info as { email?: string } | null)?.email ?? ''

  return (
    <div dir="rtl" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'var(--font-heebo, Heebo), sans-serif' }}>

      {/* ── Nav ── */}
      <header style={{ background: '#1a2a6c', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ color: '#F5C800', fontWeight: 800, fontSize: '20px', textDecoration: 'none', letterSpacing: '-0.5px' }}>
          אוטו ליין
        </Link>
        <Link href="/" style={{ color: '#fff', fontSize: '14px', opacity: 0.8, textDecoration: 'none', display: 'inline-block', padding: '12px 0' }}>
          ← חזרה לדף הבית
        </Link>
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#1a2a6c', marginBottom: '6px' }}>
          הצהרת נגישות
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '40px' }}>
          עדכון אחרון: {UPDATED}
        </p>

        <Section title="1. מחויבות לנגישות">
          אוטו ליין פנצריה ושירותי רכב מחויבת להנגשת שירותיה הדיגיטליים לכלל הציבור,
          לרבות אנשים עם מוגבלויות, בהתאם ל<strong>חוק שוויון זכויות לאנשים עם מוגבלות, התשנ&quot;ח–1998</strong>{' '}
          ו<strong>תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע&quot;ג–2013</strong>.
        </Section>

        <Section title="2. רמת הנגישות הנוכחית">
          <p style={{ marginBottom: '10px' }}>
            האתר שואף לעמוד בדרישות תקן <strong>WCAG 2.1 ברמה AA</strong>. בין הצעדים שיושמו:
          </p>
          <ul>
            <li>ניגודיות צבעים תקנית בין טקסט ורקע (יחס 4.5:1 לפחות לגופן רגיל).</li>
            <li>ניווט מלא באמצעות מקלדת בלבד.</li>
            <li>שימוש בתגיות HTML סמנטיות (header, main, nav, section, footer).</li>
            <li>מבנה כותרות היררכי (H1 → H2 → H3).</li>
            <li>תיאורי alt לתמונות בעלות משמעות.</li>
            <li>כיוון RTL מלא בעברית.</li>
            <li>פונט Heebo – מותאם לקריאה בעברית, גודל גופן בסיסי 16px.</li>
            <li>שדות טפסים עם תוויות (label) ברורות.</li>
            <li>מסגרת מיקוד בולטת לכל רכיב שניתן לנווט אליו במקלדת.</li>
            <li>חלונות קופצים (מחירון שירות, פרטי רכב) נסגרים במקש Esc ובכפתור סגירה עם תיאור קולי.</li>
            <li>כפתור יצירת הקשר הצף וכפתור התפריט מתוארים לקוראי מסך ומציינים אם הם פתוחים.</li>
            <li>כיבוד הגדרת המערכת &quot;הפחתת תנועה&quot;: בהפעלתה האנימציות והגלילה האוטומטית מושבתות.</li>
          </ul>
        </Section>

        <Section title="3. מגבלות ידועות">
          <p style={{ marginBottom: '10px' }}>
            על אף מאמצינו, ייתכנו אזורים באתר שטרם הונגשו במלואם. מגבלות ידועות:
          </p>
          <ul>
            <li>
              רצועת ביקורות הלקוחות נגללת אוטומטית. הגלילה נעצרת בהצבעה עם העכבר, ומושבתת לגמרי
              כאשר מופעלת הגדרת &quot;הפחתת תנועה&quot;.
            </li>
            <li>
              המפה (נטענת בלחיצה על &quot;הצגת מפה&quot;) היא רכיב של Google ואינה בשליטתנו. הכתובת, הטלפון וקישורי הניווט מוצגים גם כטקסט לצדה.
            </li>
            <li>תמונות שירותים ורכבים המועלות למערכת מוצגות כקישוט, והמידע עצמו מופיע בטקסט שלצידן.</li>
          </ul>
          <p style={{ marginTop: '10px' }}>אנו עובדים על שיפור מתמיד ומקבלים פניות בנושא.</p>
        </Section>

        <Section title="4. טכנולוגיות נגישות נתמכות">
          <ul>
            <li><strong>דפדפנים:</strong> Chrome, Firefox, Edge, Safari (גרסאות עדכניות).</li>
            <li><strong>מכשירים:</strong> מחשב שולחני, טאבלט, סמארטפון.</li>
            <li><strong>קוראי מסך:</strong> NVDA, JAWS (Windows), VoiceOver (macOS / iOS) – תמיכה בסיסית.</li>
          </ul>
        </Section>

        <Section title="5. פניות נגישות">
          <p style={{ marginBottom: '10px' }}>
            נתקלת בבעיית נגישות? נשמח לדעת ולתקן בהקדם. ניתן לפנות לאחראי הנגישות:
          </p>
          <ul>
            {phone   && <li><strong>טלפון:</strong> <a href={`tel:${phone}`} style={{ color: '#1a2a6c' }}>{phone}</a></li>}
            {email   && <li><strong>דואר אלקטרוני:</strong> <a href={`mailto:${email}`} style={{ color: '#1a2a6c' }}>{email}</a></li>}
            {address && <li><strong>כתובת:</strong> {address}</li>}
          </ul>
          <p style={{ marginTop: '10px' }}>
            אנו מתחייבים להגיב לפניות נגישות תוך <strong>7 ימי עסקים</strong>.
          </p>
        </Section>

        <Section title="6. הליך בקשת התאמות נגישות">
          במידה ונדרשת התאמת נגישות לקבלת שירות, ניתן לפנות טלפונית ונדאג לבצע את ההתאמה
          הנדרשת בהתאם לאפשרויות העסק ובמגבלות החוק.
        </Section>

        <Section title="7. תאריך עדכון">
          הצהרה זו עודכנה לאחרונה ב-{UPDATED}.
          אנו מתחייבים לסקור ולעדכן הצהרה זו לפחות אחת לשנה.
        </Section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px', display: 'inline-block', padding: '12px 0' }}>
            ← חזרה לדף הבית
          </Link>
          <Link href="/privacy" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px', display: 'inline-block', padding: '12px 0' }}>
            מדיניות פרטיות
          </Link>
          <Link href="/terms" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px', display: 'inline-block', padding: '12px 0' }}>
            תנאי שימוש
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
