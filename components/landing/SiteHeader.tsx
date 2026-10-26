'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from './icons'

export interface NavLink { href: string; label: string; current?: boolean }

export default function SiteHeader({ name, logo, phone, links }: {
  name: string
  logo: string | null
  phone: string
  links: NavLink[]
}) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`al-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="al-wrap al-header-in">
        <span className="al-bsd">בס״ד</span>
        <Link href="/" className="al-brand">
          {logo ? <img src={logo} alt={name} /> : <span className="al-brand-name">{name}</span>}
        </Link>
        <nav id="al-nav" className={`al-nav${open ? ' is-open' : ''}`} aria-label="ניווט ראשי" onClick={e => { if ((e.target as HTMLElement).closest('a')) setOpen(false) }}>
          {links.map(l => (
            <Link key={l.href + l.label} href={l.href} aria-current={l.current ? 'page' : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="al-header-call">
          {phone && <a href={`tel:${phone}`} className="al-call-dot" aria-label={`חיוג ל${name}`}><Icon name="phone" /></a>}
          {phone && <span>חייגו אלינו<b>{phone}</b></span>}
          <button type="button" className="al-menu-btn" aria-label="פתיחת תפריט" aria-expanded={open} aria-controls="al-nav" onClick={() => setOpen(o => !o)}>
            <Icon name="menu" size={22} />
          </button>
        </div>
      </div>
    </header>
  )
}
