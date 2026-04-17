'use client'

import { useState } from 'react'

interface PriceItem {
  id: string
  category: string
  service_name: string
  price: number | null
  price_note: string | null
}

interface Props {
  items: PriceItem[]
}

export default function PriceList({ items }: Props) {
  const categories = [...new Set(items.map(i => i.category))]
  const [open, setOpen] = useState<string | null>(categories[0] ?? null)

  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {categories.map(cat => {
        const catItems = items.filter(i => i.category === cat)
        const isOpen = open === cat

        return (
          <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Accordion header */}
            <button
              onClick={() => setOpen(isOpen ? null : cat)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: isOpen ? '#1a2a6c' : '#fff',
                color: isOpen ? '#fff' : '#1a2a6c',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'inherit',
                textAlign: 'right',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              <span>{cat}</span>
              <span style={{
                flexShrink: 0, width: '28px', height: '28px',
                borderRadius: '50%', background: isOpen ? '#F5C800' : 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px', color: isOpen ? '#1a2a6c' : '#fff',
                transition: 'background 0.2s, transform 0.25s',
                transform: isOpen ? 'rotate(180deg)' : 'none',
              }}>
                ▾
              </span>
            </button>

            {/* Accordion body */}
            {isOpen && (
              <div style={{ padding: '4px 0' }}>
                {catItems.map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 20px',
                      background: i % 2 === 0 ? '#f8fafc' : '#fff',
                      fontSize: '15px',
                    }}
                  >
                    <span style={{ color: '#334155', fontWeight: 500 }}>{item.service_name}</span>
                    <span style={{ color: '#1a2a6c', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {item.price_note && <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '4px' }}>{item.price_note}</span>}
                      {item.price != null ? `₪${item.price.toLocaleString('he-IL')}` : 'לפי בדיקה'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
