'use client'

import { useState } from 'react'

interface FaqItem {
  id: string
  question: string
  answer: string
  image_url: string | null
}

interface Props {
  items: FaqItem[]
}

export default function FaqAccordion({ items }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map(item => {
        const isOpen = open === item.id
        return (
          <div
            key={item.id}
            style={{
              border: '1px solid',
              borderColor: isOpen ? '#1a2a6c' : '#e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              transition: 'border-color 0.2s',
              background: '#fff',
              boxShadow: isOpen ? '0 4px 16px rgba(26,42,108,.08)' : 'none',
            }}
          >
            {/* Question row */}
            <button
              onClick={() => setOpen(isOpen ? null : item.id)}
              style={{
                width: '100%', textAlign: 'right',
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a2a6c', lineHeight: 1.4 }}>
                {item.question}
              </span>
              <span style={{
                flexShrink: 0, width: '24px', height: '24px',
                borderRadius: '50%', background: isOpen ? '#1a2a6c' : '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', color: isOpen ? '#F5C800' : '#64748b',
                transition: 'background 0.2s, transform 0.2s',
                transform: isOpen ? 'rotate(180deg)' : 'none',
              }}>
                ▾
              </span>
            </button>

            {/* Answer */}
            {isOpen && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, marginTop: '14px' }}>
                  {item.answer}
                </p>
                {item.image_url && (
                  <div style={{ marginTop: '14px' }}>
                    <img
                      src={item.image_url}
                      alt=""
                      style={{
                        maxWidth: '100%', borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
