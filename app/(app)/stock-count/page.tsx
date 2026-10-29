import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'

export const metadata = { title: 'ספירת מלאי' }

// One entry point for all stock counts (they used to be three separate buttons in different screens)
const OPTIONS = [
  { href: '/scan?count=1',          icon: '📷', title: 'ספירה בסריקה',        text: 'סורקים ברקודים של צמיגים ומוצרים — כל סריקה מוסיפה 1. בסוף מאשרים ומעדכנים מלאי.' },
  { href: '/tires/inventory-count', icon: '📋', title: 'ספירת צמיגים מלאה',   text: 'ספירה של כל הצמיגים מול הרשימה, עם סיכום הפרשים לפני העדכון.' },
  { href: '/tires/storage',         icon: '🗄', title: 'ספירה לפי ארונות',    text: 'סופרים מדף אחרי מדף לפי מפת הארונות, ורואים מה נספר ומתי.' },
]

export default function StockCountPage() {
  return (
    <>
      <PageHeader icon={<span aria-hidden="true" style={{ fontSize: 20 }}>📦</span>} iconBg="linear-gradient(135deg,#0f172a,#334155)"
        iconShadow="#0f172a44" title="ספירת מלאי" subtitle="בחר איך לספור" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', maxWidth: 900 }}>
        {OPTIONS.map(o => (
          <Link key={o.href} href={o.href} style={{
            display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px', borderRadius: '14px', textDecoration: 'none',
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'var(--shadow)',
          }}>
            <span aria-hidden="true" style={{ fontSize: '30px' }}>{o.icon}</span>
            <span style={{ fontSize: '17px', fontWeight: 800 }}>{o.title}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.text}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
