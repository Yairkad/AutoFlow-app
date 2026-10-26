import Link from 'next/link'

export default function SiteFooter({ name, logo }: { name: string; logo: string | null }) {
  return (
    <footer className="al-footer">
      <div className="al-wrap">
        {logo ? <span className="al-logo-tile"><img src={logo} alt={name} /></span> : <strong style={{ color: '#fff', fontSize: 18 }}>{name}</strong>}
        <nav aria-label="קישורים">
          <Link href="/guide">מדריך הצמיגים</Link>
          <Link href="/privacy">פרטיות</Link>
          <Link href="/terms">תנאי שימוש</Link>
          <Link href="/accessibility">נגישות</Link>
          <Link href="/login">כניסת עובדים</Link>
        </nav>
      </div>
    </footer>
  )
}
