import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'הצהרת נגישות – אוטוליין',
  description: 'הצהרת הנגישות של אוטוליין פנצריה ושירותי רכב',
}

const UPDATED = '17 במרץ 2026'

export default function AccessibilityPage() {
  return (
    <div dir="rtl" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'var(--font-heebo, Heebo), sans-serif' }}>

      {/* ── Nav ── */}
      <header style={{ background: '#1a2a6c', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ color: '#F5C800', fontWeight: 800, fontSize: '20px', textDecoration: 'none', letterSpacing: '-0.5px' }}>
          אוטוליין
        </Link>
        <Link href="/" style={{ color: '#fff', fontSize: '14px', opacity: 0.8, textDecoration: 'none' }}>
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
          אוטוליין פנצריה ושירותי רכב מחויבת להנגשת שירותיה הדיגיטליים לכלל הציבור,
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
            <li>פונט Heebo – מותאם לקריאה בעברית, גודל גופן מינימלי 14px.</li>
            <li>שדות טפסים עם תוויות (label) ברורות.</li>
          </ul>
        </Section>

        <Section title="3. מגבלות ידועות">
          <p style={{ marginBottom: '10px' }}>
            על אף מאמצינו, ייתכנו אזורים באתר שטרם הונגשו במלואם. מגבלות ידועות:
          </p>
          <ul>
            <li>תמונות מבצעים דינמיות – נשאף לספק חלופת טקסט לכל תמונה.</li>
            <li>קרוסל המבצעים – מוצגות בקרות ניווט נגישות, אך ייתכנו שיפורים נוספים.</li>
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
            <li><strong>טלפון:</strong> [מספר טלפון]</li>
            <li><strong>כתובת:</strong> [כתובת העסק]</li>
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

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <Link href="/" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
            ← חזרה לדף הבית
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
