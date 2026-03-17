'use client'

import { useState, useEffect, useCallback } from 'react'

interface Promotion {
  id: string
  title: string
  description: string | null
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

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (promotions.length <= 1) return
    const t = setInterval(next, 5000)
    return () => clearInterval(t)
  }, [next, promotions.length])

  if (promotions.length === 0) return null

  const promo = promotions[idx]

  return (
    <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#1a2a6c' }}>
      {/* Image / placeholder */}
      <div style={{ height: '320px', background: promo.image_url ? `url(${promo.image_url}) center/cover` : 'linear-gradient(135deg,#1a2a6c,#2d4a9e)', display: 'flex', alignItems: 'flex-end' }}>
        {!promo.image_url && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F5C800', fontSize: '48px', opacity: 0.3 }}>
            %
          </div>
        )}

        {/* Gradient overlay for text */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(0,0,0,.75), transparent)' }} />

        {/* Text */}
        <div style={{ position: 'relative', padding: '24px', color: '#fff', zIndex: 1 }}>
          <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px' }}>{promo.title}</h3>
          {promo.description && (
            <p style={{ fontSize: '15px', opacity: 0.9, margin: 0 }}>{promo.description}</p>
          )}
          {promo.link_url && (
            <a href={promo.link_url} style={{ display: 'inline-block', marginTop: '10px', background: '#F5C800', color: '#1a2a6c', padding: '6px 16px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
              למידע נוסף
            </a>
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
        <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', zIndex: 2 }}>
          {promotions.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`מבצע ${i + 1}`}
              style={{
                width: i === idx ? '20px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === idx ? '#F5C800' : 'rgba(255,255,255,.5)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
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
    [side]: '12px',
    transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,.4)',
    border: 'none',
    color: '#fff',
    fontSize: '28px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    lineHeight: 1,
    padding: 0,
  }
}
