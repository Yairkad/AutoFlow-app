'use client'

import { useState, useEffect, useCallback } from 'react'

interface Promotion {
  id: string
  title: string
  description: string | null
  fine_print: string | null
  image_url: string | null
  link_url: string | null
}

interface Props {
  promotions: Promotion[]
}

export default function PromotionsCarousel({ promotions }: Props) {
  const [idx, setIdx] = useState(0)

  const next = useCallback(() => setIdx(i => (i + 1) % promotions.length), [promotions.length])
  const prev = useCallback(() => setIdx(i => (i - 1 + promotions.length) % promotions.length), [promotions.length])

  useEffect(() => {
    if (promotions.length <= 1) return
    const t = setInterval(next, 5000)
    return () => clearInterval(t)
  }, [next, promotions.length])

  if (promotions.length === 0) return null

  const promo = promotions[idx]

  return (
    <div style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(26,42,108,.25)' }}>
      <div style={{
        minHeight: promo.image_url ? '220px' : 'unset',
        background: promo.image_url
          ? `url(${promo.image_url}) center/cover`
          : 'linear-gradient(135deg, #1a2a6c 0%, #23389e 55%, #1b3a8f 100%)',
        position: 'relative',
        display: 'flex',
        alignItems: promo.image_url ? 'flex-end' : 'center',
      }}>

        {/* Decorative circles (no-image only) */}
        {!promo.image_url && (
          <>
            <div style={{
              position: 'absolute', top: '-80px', right: '-80px',
              width: '300px', height: '300px', borderRadius: '50%',
              background: 'rgba(255,255,255,.06)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: '-50px', left: '-50px',
              width: '200px', height: '200px', borderRadius: '50%',
              background: 'rgba(245,200,0,.08)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: '30px', left: '38%',
              width: '120px', height: '120px', borderRadius: '50%',
              border: '2px solid rgba(245,200,0,.12)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 30px, rgba(255,255,255,.015) 30px, rgba(255,255,255,.015) 60px)',
              pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Gradient overlay for image */}
        {promo.image_url && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%',
            background: 'linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.4) 60%, transparent 100%)',
            pointerEvents: 'none',
          }} />
        )}

        {/* "Hot deal" badge */}
        <div style={{
          position: 'absolute', top: '20px', right: '20px',
          background: '#F5C800', color: '#1a2a6c',
          fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px',
          padding: '5px 14px', borderRadius: '20px',
          display: 'flex', alignItems: 'center', gap: '5px',
          boxShadow: '0 2px 10px rgba(245,200,0,.45)',
          zIndex: 3,
        }}>
          🔥 מבצע חם
        </div>

        {/* Slide counter */}
        {promotions.length > 1 && (
          <div style={{
            position: 'absolute', top: '20px', left: '20px',
            background: 'rgba(255,255,255,.12)', color: '#fff',
            fontSize: '12px', fontWeight: 600, padding: '4px 10px',
            borderRadius: '12px', zIndex: 3, backdropFilter: 'blur(4px)',
          }}>
            {idx + 1} / {promotions.length}
          </div>
        )}

        {/* Main content */}
        <div style={{
          position: 'relative', zIndex: 2,
          padding: promo.image_url ? '20px 24px' : '28px 28px',
          color: '#fff', width: '100%',
        }}>
          <h3 style={{
            fontSize: '22px', fontWeight: 900, margin: '0 0 8px',
            lineHeight: 1.3,
          }}>
            {promo.title}
          </h3>
          {promo.description && (
            <p style={{
              fontSize: '14px', color: 'rgba(255,255,255,.82)',
              margin: '0 0 16px', lineHeight: 1.6, maxWidth: '520px',
            }}>
              {promo.description}
            </p>
          )}
          {promo.link_url && (
            <a
              href={promo.link_url}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#F5C800', color: '#1a2a6c',
                padding: '8px 18px', borderRadius: '8px',
                fontWeight: 800, fontSize: '13px', textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(245,200,0,.4)',
              }}
            >
              למידע נוסף ←
            </a>
          )}

          {/* Bottom separator line (no-image only) */}
          {!promo.image_url && (
            <div style={{
              marginTop: '20px',
              height: '1px',
              background: 'linear-gradient(to left, rgba(245,200,0,.5), transparent)',
              borderRadius: '1px',
              maxWidth: '160px',
            }} />
          )}

          {/* Fine print */}
          {promo.fine_print && (
            <p style={{
              fontSize: '11px', color: 'rgba(255,255,255,.45)',
              margin: promo.image_url ? '12px 0 0' : '10px 0 0',
              lineHeight: 1.5,
            }}>
              * {promo.fine_print}
            </p>
          )}
        </div>
      </div>

      {/* Prev/Next arrows */}
      {promotions.length > 1 && (
        <>
          <button onClick={prev} aria-label="מבצע קודם" style={arrowSt('right')}>&#8250;</button>
          <button onClick={next} aria-label="מבצע הבא"  style={arrowSt('left')}>&#8249;</button>
        </>
      )}

      {/* Dots */}
      {promotions.length > 1 && (
        <div style={{
          position: 'absolute', bottom: '16px', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: '6px', zIndex: 2,
        }}>
          {promotions.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`מבצע ${i + 1}`}
              style={{
                width: i === idx ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === idx ? '#F5C800' : 'rgba(255,255,255,.4)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'width 0.3s, background 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function arrowSt(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: '14px',
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,.15)',
    border: '1px solid rgba(255,255,255,.2)',
    color: '#fff',
    fontSize: '28px',
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    lineHeight: 1,
    padding: 0,
    backdropFilter: 'blur(4px)',
  }
}
