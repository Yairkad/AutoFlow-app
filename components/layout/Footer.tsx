'use client'

import Link from 'next/link'
import versionData from '@/lib/version.json'

export default function Footer() {
  return (
    <footer style={{
      marginRight: 'var(--sidebar-w)',
      borderTop: '1px solid var(--border)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
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
        <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          מדיניות פרטיות
        </Link>
        <Link href="/accessibility" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          הצהרת נגישות
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>v{versionData.version}</span>
      </div>
    </footer>
  )
}
