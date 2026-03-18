import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'מדיניות פרטיות – אוטוליין',
  description: 'מדיניות הפרטיות של אוטוליין פנצריה ושירותי רכב',
}

const TENANT_ID = 'c618f567-139b-4ce9-ac77-67affe93c27d'
const UPDATED   = '17 במרץ 2026'

export default async function PrivacyPage() {
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
          מדיניות פרטיות
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '40px' }}>
          עדכון אחרון: {UPDATED}
        </p>

        <Section title="1. מבוא">
          {name} (&quot;אנחנו&quot;, &quot;העסק&quot;) מחויבים להגנה על פרטיות
          לקוחותינו. מדיניות זו מסבירה כיצד אנו אוספים, משתמשים ומגנים על מידע אישי שנמסר לנו,
          בהתאם לחוק הגנת הפרטיות, התשמ&quot;א-1981 ותקנותיו.
        </Section>

        <Section title="2. מידע שאנו אוספים">
          <p style={{ marginBottom: '10px' }}>בעת קבלת שירות או שימוש באתר, אנו עשויים לאסוף:</p>
          <ul>
            <li><strong>פרטי זיהוי:</strong> שם מלא, מספר טלפון.</li>
            <li><strong>פרטי רכב:</strong> לוחית רישוי, יצרן, דגם, שנת ייצור.</li>
            <li><strong>מידע על השירות:</strong> סוג העבודה, סטטוס הטיפול, הערות טכניות.</li>
            <li><strong>מידע טכני:</strong> כתובת IP, סוג דפדפן – לצורך שיפור האתר בלבד.</li>
          </ul>
          <p style={{ marginTop: '10px' }}>
            אנו לא אוספים מספרי כרטיסי אשראי, תעודות זהות, או מידע רגיש אחר ללא הסכמה מפורשת.
          </p>
        </Section>

        <Section title="3. מטרת השימוש במידע">
          <ul>
            <li>מתן שירות רכב ועדכון לקוחות על סטטוס הרכב בזמן אמת.</li>
            <li>שליחת עדכונים (WhatsApp / SMS) על התקדמות הטיפול.</li>
            <li>ניהול חשבונות ותשלומים.</li>
            <li>שיפור השירות וניתוח דפוסי שימוש באתר.</li>
            <li>עמידה בדרישות חוקיות ורגולטוריות.</li>
          </ul>
        </Section>

        <Section title="4. שיתוף עם צדדים שלישיים">
          <p style={{ marginBottom: '10px' }}>
            אנו לא מוכרים, סוחרים, או מעבירים מידע אישי לצדדים שלישיים, למעט:
          </p>
          <ul>
            <li>
              <strong>ספקי תשתית:</strong> חברות ענן המסייעות בהפעלת האתר (Supabase, Vercel),
              הכפופות להסכמי עיבוד נתונים מחייבים ותקני אבטחה גבוהים.
            </li>
            <li>
              <strong>חובה חוקית:</strong> כאשר נדרשים על פי חוק, צו שיפוטי, או בקשת רשות מוסמכת.
            </li>
          </ul>
        </Section>

        <Section title="5. אבטחת מידע">
          אנו נוקטים אמצעי אבטחה טכניים וארגוניים כדי להגן על המידע האישי, כולל
          הצפנת תעבורה (HTTPS/TLS), בקרת גישה מבוססת הרשאות, ואחסון מאובטח בשרתי ענן באירופה.
          אין שיטת העברה אלקטרונית בטוחה ב-100%, אך אנו פועלים לצמצום הסיכונים ככל הניתן.
        </Section>

        <Section title="6. עוגיות (Cookies)">
          האתר משתמש בעוגיות חיוניות בלבד לצורך מעקב סטטוס רכב.
          לא נעשה שימוש בעוגיות פרסומיות או מעקב. ניתן לכבות עוגיות בהגדרות הדפדפן,
          אך הדבר עשוי לפגוע בפעולת שאילתת הסטטוס.
        </Section>

        <Section title="7. זכויות הנושא">
          <p style={{ marginBottom: '10px' }}>בהתאם לחוק הגנת הפרטיות הישראלי, עומדות לך הזכויות הבאות:</p>
          <ul>
            <li><strong>עיון:</strong> לקבל עותק של המידע האישי השמור עליך.</li>
            <li><strong>תיקון:</strong> לבקש תיקון מידע שגוי או לא עדכני.</li>
            <li><strong>מחיקה:</strong> לבקש מחיקת מידע, ככל שאין חובה חוקית לשמירתו.</li>
          </ul>
          <p style={{ marginTop: '10px' }}>לממש זכויות אלו, צור קשר בפרטים שבסעיף 9.</p>
        </Section>

        <Section title="8. שמירת מידע">
          מידע על עסקאות ושירותים נשמר למשך 7 שנים בהתאם לדרישות חוק הנהלת חשבונות הישראלי.
          מידע שאינו נחוץ עוד נמחק בהתאם לנהלי העסק.
        </Section>

        <Section title="9. יצירת קשר">
          <p style={{ marginBottom: '10px' }}>לשאלות, עיון, תיקון או מחיקת מידע – ניתן לפנות:</p>
          <ul>
            {phone   && <li><strong>טלפון:</strong> <a href={`tel:${phone}`}   style={{ color: '#1a2a6c' }}>{phone}</a></li>}
            {email   && <li><strong>דואר אלקטרוני:</strong> <a href={`mailto:${email}`} style={{ color: '#1a2a6c' }}>{email}</a></li>}
            {address && <li><strong>כתובת:</strong> {address}</li>}
          </ul>
          <p style={{ marginTop: '10px' }}>נשיב לפניות תוך 30 ימי עסקים.</p>
        </Section>

        <Section title="10. שינויים במדיניות">
          אנו עשויים לעדכן מדיניות זו מעת לעת. שינויים מהותיים יפורסמו באתר.
          המשך השימוש באתר לאחר פרסום השינויים מהווה הסכמה לתנאים המעודכנים.
        </Section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
            ← חזרה לדף הבית
          </Link>
          <Link href="/terms" style={{ color: '#1a2a6c', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
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
