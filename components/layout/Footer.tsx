'use client'

import Link from 'next/link'
import versionData from '@/lib/version.json'

export default function Footer({ inner }: { inner?: boolean } = {}) {
  return (
    <footer style={{
      marginRight: inner ? 0 : 'var(--sidebar-w)',
      borderTop: '1px solid var(--border)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: '8px',
      background: '#f8fafc',
      fontSize: '12px',
      color: 'var(--text-muted)',
    }}>
      <div>
        אפיון, עיצוב ופיתוח:{' '}
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>יאיר קדוש</span>
        {' '}| כל הזכויות שמורות © {new Date().getFullYear()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/privacy" className="link-hover" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          מדיניות פרטיות
        </Link>
        <Link href="/accessibility" className="link-hover" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          הצהרת נגישות
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>v{versionData.version}</span>
      </div>
    </footer>
  )
}
