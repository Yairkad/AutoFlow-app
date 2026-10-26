'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import GuideDiagram from '@/components/guide/GuideDiagrams'
import { pick, sectionImages, type GuideContent, type GuideImage, type GuideSection, type GuideTopic, type Lang } from '@/lib/guide/content'

export interface GuideBusiness { name: string; subTitle: string; phone: string; address: string; logo: string | null; bg: string; accent: string }

const ICON_BG: Record<GuideTopic['icon'], [string, string]> = {
  alignment: ['#ffedd5', '#c2410c'], tire: ['#dbeafe', '#1d4ed8'], puncture: ['#fee2e2', '#b91c1c'],
}

function TopicIcon({ icon }: { icon: GuideTopic['icon'] }) {
  const [bg, c] = ICON_BG[icon]
  return (
    <div style={{ width: 46, height: 46, borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden>
        {icon === 'alignment' && <><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="2" /></>}
        {icon === 'tire' && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>}
        {icon === 'puncture' && <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>}
      </svg>
    </div>
  )
}

/** "**bold**" inside a line → <strong>. Text is rendered as React text, never as HTML. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <bdi key={i}><strong>{p.slice(2, -2)}</strong></bdi> : p)}</>
}

/** One paragraph per line; consecutive "- " lines become a bullet list. */
function Body({ text }: { text: string }) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    out.push(<ul key={out.length} style={{ listStyle: 'disc', paddingInlineStart: 20, margin: '4px 0 8px', lineHeight: 1.75 }}>{bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}</ul>)
    bullets = []
  }
  for (const ln of lines) {
    if (ln.startsWith('- ')) { bullets.push(ln.slice(2)); continue }
    flush()
    out.push(<p key={out.length} style={{ margin: '0 0 8px', lineHeight: 1.65 }}><Inline text={ln} /></p>)
  }
  flush()
  return <div style={{ fontSize: 14.5, color: '#334155' }}>{out}</div>
}

function Photos({ images }: { images: GuideImage[] }) {
  return <>{images.map((im, i) => <Photo key={i} src={im.src} credit={im.credit} />)}</>
}

function Photo({ src, credit }: { src?: string | null; credit?: string | null }) {
  if (!src) return null
  return (
    <figure style={{ margin: '10px 0' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: '100%', borderRadius: 14, display: 'block' }} />
      {credit && <figcaption style={{ fontSize: 10.5, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>{credit}</figcaption>}
    </figure>
  )
}

function SectionContent({ s, lang }: { s: GuideSection; lang: Lang }) {
  const imgs = sectionImages(s)
  return <>
    {s.diagram && !s.hideDiagram && <GuideDiagram kind={s.diagram} lang={lang} />}
    <Photos images={imgs.filter(im => im.position !== 'after')} />
    <Body text={pick(s.body, lang)} />
    <Photos images={imgs.filter(im => im.position === 'after')} />
  </>
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: '1px solid #e5eaf1', boxShadow: '0 2px 10px rgba(15,23,42,.05)' }

// legalLinks: only on the site's own /guide — /privacy and /terms are that business's policies, not other garages'.
export default function GuideView({ content, business, legalLinks = false }: { content: GuideContent; business: GuideBusiness; legalLinks?: boolean }) {
  const [lang, setLang]   = useState<Lang>('he')
  // Topic lives in the URL hash so the phone's back button returns to the hub
  const hash    = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '')
  const topicId = decodeURIComponent(hash.slice(1)) || null
  const [open, setOpen]   = useState<Record<string, boolean>>({})
  const topics = content.topics.filter(t => t.enabled)
  const topic  = topics.find(t => t.id === topicId) ?? null
  const dir    = lang === 'en' ? 'ltr' : 'rtl'

  useEffect(() => { window.scrollTo(0, 0) }, [topicId])

  const changeLang = setLang


  const LangToggle = (
    <div dir="ltr" style={{ display: 'flex', background: 'rgba(255,255,255,.18)', borderRadius: 999, padding: 3, fontSize: 13, fontWeight: 800 }}>
      {(['he', 'en'] as Lang[]).map(l => (
        <button key={l} onClick={() => changeLang(l)} style={{
          border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontFamily: 'inherit', fontWeight: 800,
          background: lang === l ? '#fff' : 'transparent', color: lang === l ? business.bg : '#fff',
        }}>{l === 'he' ? 'עב' : 'EN'}</button>
      ))}
    </div>
  )

  return (
    <div dir={dir} lang={lang} style={{ minHeight: '100vh', background: '#f3f6fa', color: '#0f172a' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 24 }}>

        {/* Header */}
        <header style={{ background: `linear-gradient(135deg, ${business.bg}, ${business.bg}dd)`, color: '#fff', padding: '18px 18px 22px', borderRadius: '0 0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            {topic ? (
              <button onClick={() => history.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                {lang === 'en' ? '← Back to guide' : '→ חזרה למדריך'}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {business.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={business.logo} alt={business.name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', background: '#fff', padding: 3, flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 17 }}>{business.name}</div>
                  {business.subTitle && <div style={{ fontSize: 12, opacity: .85 }}>{business.subTitle}</div>}
                </div>
              </div>
            )}
            {LangToggle}
          </div>
          <h1 style={{ fontSize: 25, fontWeight: 900, margin: '16px 0 4px' }}>{topic ? pick(topic.title, lang) : pick(content.title, lang)}</h1>
          <p style={{ fontSize: 14, opacity: .92, lineHeight: 1.55, margin: 0 }}>{topic ? pick(topic.intro, lang) : pick(content.lead, lang)}</p>
        </header>

        {/* Hub */}
        {!topic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            {topics.map(tp => (
              <a key={tp.id} href={'#' + encodeURIComponent(tp.id)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: 16, textDecoration: 'none', color: 'inherit' }}>
                <TopicIcon icon={tp.icon} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16.5 }}>{pick(tp.title, lang)}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{pick(tp.summary, lang)}</div>
                </div>
                <span aria-hidden style={{ color: '#94a3b8', fontSize: 20 }}>{lang === 'en' ? '›' : '‹'}</span>
              </a>
            ))}
          </div>
        )}

        {/* Topic */}
        {topic && (
          <div style={{ padding: '4px 14px' }}>
            <Photos images={sectionImages(topic).filter(im => im.position !== 'after')} />
            {topic.layout === 'cards' ? topic.sections.map(s => (
              <section key={s.id} style={{ ...card, padding: '14px 16px', margin: '12px 0' }}>
                <h2 style={{ fontSize: 17, fontWeight: 900, margin: '0 0 6px' }}>{pick(s.title, lang)}</h2>
                <SectionContent s={s} lang={lang} />
              </section>
            )) : (
              <div style={{ ...card, overflow: 'hidden', margin: '12px 0' }}>
                {topic.sections.map((s, i) => {
                  const isOpen = !!open[s.id]
                  return (
                    <section key={s.id} style={{ borderTop: i ? '1px solid #eef2f6' : 'none' }}>
                      <button onClick={() => setOpen(o => ({ ...o, [s.id]: !isOpen }))} aria-expanded={isOpen} style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                        padding: '16px', background: isOpen ? '#f8fafc' : '#fff', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 16, fontWeight: 800, color: '#0f172a', textAlign: 'start',
                      }}>
                        {pick(s.title, lang)}
                        <span aria-hidden style={{ fontSize: 20, color: business.bg, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }}>+</span>
                      </button>
                      {isOpen && <div style={{ padding: '0 16px 14px' }}><SectionContent s={s} lang={lang} /></div>}
                    </section>
                  )
                })}
              </div>
            )}
            <Photos images={sectionImages(topic).filter(im => im.position === 'after')} />
          </div>
        )}

        {/* Contact footer */}
        {(business.phone || business.address) && (
          <div style={{ margin: '8px 16px 0', background: '#0f172a', color: '#fff', borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14 }}>
              {lang === 'en' ? 'Questions? We\'re here' : 'שאלה? אנחנו כאן'}
              <div style={{ opacity: .7, fontSize: 12.5, marginTop: 2 }}>{[business.phone, business.address].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        )}
        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: '14px 16px 0' }}>{pick(content.footerNote, lang)}</p>
        {legalLinks && (
          <p style={{ fontSize: 12.5, textAlign: 'center', margin: '6px 16px 0', display: 'flex', justifyContent: 'center', gap: 16 }}>
            <a href="/privacy" style={{ color: '#475569', textDecoration: 'underline', padding: '6px 0' }}>{lang === 'en' ? 'Privacy policy' : 'מדיניות פרטיות'}</a>
            <a href="/terms" style={{ color: '#475569', textDecoration: 'underline', padding: '6px 0' }}>{lang === 'en' ? 'Terms of use' : 'תנאי שימוש'}</a>
            <a href="/accessibility" style={{ color: '#475569', textDecoration: 'underline', padding: '6px 0' }}>{lang === 'en' ? 'Accessibility' : 'נגישות'}</a>
          </p>
        )}
      </div>
    </div>
  )
}
