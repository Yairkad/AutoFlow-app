import Link from 'next/link'

// Active promotions as coupons: text on one side, a "torn-off" stub with the benefit
// and the expiry date on the other. No expiry date → the stub shows the benefit only.

export interface Coupon {
  id: string
  title: string
  description: string | null
  fine_print: string | null
  link_url: string | null
  end_date: string | null
  benefit?: string | null
  benefit_sub?: string | null
}

function shortDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${Number(d)}.${Number(m)}`
}

export default function PromotionCoupons({ items }: { items: Coupon[] }) {
  return (
    <div className={`al-coupons${items.length === 1 ? ' is-single' : ''}`}>
      {items.map(p => {
        const external = !!p.link_url && /^https?:\/\//.test(p.link_url)
        const href = p.link_url || '#contact'
        const label = p.link_url ? 'לפרטים ←' : 'לתיאום ←'
        return (
          <article key={p.id} className="al-coupon">
            <div className="al-coupon-main">
              <span className="al-coupon-eyebrow">מבצע</span>
              <h3>{p.title}</h3>
              {p.description && <p>{p.description}</p>}
              {p.fine_print && <small>{p.fine_print}</small>}
              {external
                ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
                : <Link href={href}>{label}</Link>}
            </div>
            <div className="al-coupon-stub">
              <b>{p.benefit?.trim() || 'מבצע'}</b>
              {p.benefit_sub?.trim() && <span>{p.benefit_sub}</span>}
              {p.end_date && <span>בתוקף עד {shortDate(p.end_date)}</span>}
            </div>
          </article>
        )
      })}
    </div>
  )
}
