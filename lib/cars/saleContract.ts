// Car sale contract (זיכרון דברים / חוזה למכירת רכב) — data model, default wording and print HTML.
// Content lives in car_sale_contracts.data; quick-fill seller + default clauses in car_contract_settings.

export interface ContractParty {
  name: string
  idNum: string
  phone: string
  address: string
}

export interface ContractCheck {
  num: string
  amount: string
  date: string   // yyyy-mm-dd
}

// legacy single-method field (contracts saved before mixed payments)
export type PaymentMethod = 'checks' | 'cash' | 'transfer'

// One cash / bank-transfer installment; checks have their own table
export interface PayLine {
  id: string
  kind: 'cash' | 'transfer'
  amount: string
  date: string   // yyyy-mm-dd, empty = at signing
  note: string
}

// kind 'checks' = shown only when paying by checks
export interface ContractClause {
  id: string
  kind?: 'checks'
  title: string
  items: string[]
}

export interface ContractData {
  title: string
  location: string
  date: string   // yyyy-mm-dd
  seller: ContractParty
  buyer: ContractParty
  car: { plate: string; model: string; year: string; vin: string }
  price: string
  priceWords: string
  // true once the user typed the words himself — stop auto-filling from the price
  priceWordsManual?: boolean
  // mixed payment: any number of cash/transfer lines + optional checks
  payLines: PayLine[]
  checksOn: boolean
  checks: ContractCheck[]
  payment?: PaymentMethod
  paymentDetails?: string
  clauses: ContractClause[]
}

// The user's own saved details (quick-fill into seller or buyer)
export interface MyDetails extends ContractParty {
  location: string
}

export interface ContractRow {
  id: string
  car_id: string | null
  plate: string | null
  car_desc: string | null
  seller_name: string | null
  buyer_name: string | null
  contract_date: string | null
  total_price: string | null
  status: 'draft' | 'signed'
  data: ContractData
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export const CONTRACT_TITLE = 'זיכרון דברים / חוזה למכירת רכב'

export const DEFAULT_CLAUSES: ContractClause[] = [
  { id: 'seller', title: 'הצהרות המוכר', items: [
    'המוכר מצהיר כי הינו הבעלים החוקי והבלעדי של הרכב.',
    'המוכר מצהיר כי פרטי הרכב תואמים את הרשום ברישיון הרכב המקורי וברישומי משרד התחבורה.',
    'המוכר מצהיר כי הרכב נקי מכל חוב, שעבוד, עיקול, זכות צד שלישי או הגבלה אחרת. ככל שישנם חובות או עיקולים כאמור, מתחייב המוכר לסלקם מיידית ועל חשבונו.',
  ] },
  { id: 'buyer', title: 'הצהרות הקונה', items: [
    'הקונה מצהיר כי ראה ובדק את הרכב (מכאנית, חיצונית ומשפטית) ומצא אותו מתאים לצרכיו ולשביעות רצונו המלאה.',
    'הקונה מוותר בזאת על כל טענת אי-התאמה, פגם או מום (למעט מום נסתר שהיה בידיעת המוכר ולא גולה).',
  ] },
  { id: 'checks', kind: 'checks', title: 'אחריות לתשלום, חזרת שיקים ופירעון מוקדם', items: [
    'חזרת שיק: במידה ושיק מתוך הסדרה הנ"ל יחזור מכל סיבה שהיא (לרבות א.ק.מ, הוראת ביטול, עיקול בחשבון, חוסר כיסוי וכו\'), ייחשב הדבר כהפרה יסודית של הסכם זה.',
    'העמדה לפירעון מיידי: במקרה של חזרת שיק שלא נפרע במזומן תוך 3 ימי עסקים ממועד הודעת המוכר לקונה, תעמוד כל יתרת החוב לפירעון מיידי.',
    'הוצאות גבייה ופיצויים: הקונה מתחייב לשאת בכל הוצאות הגבייה, שכ"ט עו"ד, אגרות הוצאה לפועל וריביות פיגורים כחוק שייגרמו למוכר עקב חזרת השיק/ים.',
    'השיקים יוגשו לפירעון במועדם. לא תהא לקונה זכות לבטל שיק או להורות על ביטולו ללא הסכמה בכתב ומראש מהמוכר.',
  ] },
  { id: 'insurance', title: 'ביטוח, דוחות ואחריות ממועד המסירה', items: [
    'מרגע מסירת הרכב לידי הקונה, חלה על הקונה האחריות הבלעדית לביצוע ביטוח חובה ומקיף/צד ג\' על שמו. המוכר לא יישא בשום אחריות לנזק, תאונה או אובדן.',
    'כל קנס, דוח תנועה, דוח חנייה, אגרת כבישי אגרה או כל חוב המתרחש ממועד מסירת הרכב והילך – יחולו על הקונה בלבד. הקונה מתחייב לשלמם במועד ולשפות את המוכר על כל הוצאה שתיגרם לו בגינם.',
  ] },
  { id: 'misc', title: 'שונות', items: [
    'כל שינוי בהסכם זה יהיה בתוקף אך ורק אם נעשה בכתב ונחתם על ידי שני הצדדים.',
    'הצדדים מצהירים כי קראו את ההסכם, הבינו את תוכנו וחתמו עליו מרצונם החופשי.',
  ] },
]

export const emptyParty = (): ContractParty => ({ name: '', idNum: '', phone: '', address: '' })

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function cloneClauses(c: ContractClause[]): ContractClause[] {
  return c.map(x => ({ ...x, items: [...x.items] }))
}

export function newContract(opts: {
  myDetails?: MyDetails | null
  clauses?: ContractClause[] | null
  car?: Partial<ContractData['car']>
  buyer?: Partial<ContractParty>
  price?: string
} = {}): ContractData {
  const { myDetails, clauses, car, buyer, price } = opts
  return {
    title: CONTRACT_TITLE,
    location: myDetails?.location ?? '',
    date: todayIso(),
    // parties stay empty — "הפרטים שלי" fills either side on demand
    seller: emptyParty(),
    buyer: { ...emptyParty(), ...buyer },
    car: { plate: '', model: '', year: '', vin: '', ...car },
    price: price ?? '',
    priceWords: price ? priceToWords(price) : '',
    payLines: [],
    checksOn: true,
    checks: [{ num: '', amount: '', date: '' }],
    clauses: cloneClauses(clauses?.length ? clauses : DEFAULT_CLAUSES),
  }
}

// Contracts saved with the old single payment method → mixed-payment shape
export function normalizeContract(d: ContractData): ContractData {
  if (Array.isArray(d.payLines)) return d
  const legacy = d.payment ?? 'checks'
  return {
    ...d,
    checksOn: legacy === 'checks',
    payLines: legacy === 'checks' ? [] : [{ id: newId(), kind: legacy, amount: d.price, date: '', note: d.paymentDetails ?? '' }],
    checks: d.checks?.length ? d.checks : [{ num: '', amount: '', date: '' }],
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const payLinesTotal = (d: ContractData) => d.payLines.reduce((s, l) => s + parseAmount(l.amount), 0)
export const checksTotal   = (d: ContractData) => d.checksOn ? d.checks.reduce((s, c) => s + parseAmount(c.amount), 0) : 0

// Clauses that actually appear for the chosen payment methods (numbering follows this list)
export function visibleClauses(d: ContractData) {
  return d.clauses.filter(c => c.kind !== 'checks' || d.checksOn)
}

const HEB_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'
export const itemLetter = (i: number) => HEB_LETTERS[i] ?? String(i + 1)

export const fmtDate = (iso: string) => iso ? iso.split('-').reverse().join('/') : ''

export const parseAmount = (s: string) => Number(String(s).replace(/[^\d.]/g, '')) || 0

export const fmtAmount = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 2 })

// ── Number → Hebrew words (masculine, as in "...שקלים חדשים") ─────────────────

const ONES  = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה']
const TEENS = ['עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר']
const TENS  = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים']
const HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות']
const THOUSANDS = ['', 'אלף', 'אלפיים', 'שלושת אלפים', 'ארבעת אלפים', 'חמשת אלפים', 'ששת אלפים', 'שבעת אלפים', 'שמונת אלפים', 'תשעת אלפים', 'עשרת אלפים']

// Parts of a number below 1000, without the connecting ו
function under1000(n: number): string[] {
  const parts: string[] = []
  const h = Math.floor(n / 100), rest = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10])
  else {
    const t = Math.floor(rest / 10), o = rest % 10
    if (t) parts.push(TENS[t])
    if (o) parts.push(ONES[o])
  }
  return parts
}

function joinParts(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? ''
  return parts.slice(0, -1).join(' ') + ' ו' + parts[parts.length - 1]
}

export function numberToHebrewWords(num: number): string {
  num = Math.floor(num)
  if (!num) return 'אפס'
  if (num >= 1e9) return ''
  const parts: string[] = []
  const millions = Math.floor(num / 1e6)
  const thousands = Math.floor((num % 1e6) / 1000)
  const rest = num % 1000
  if (millions) parts.push(millions === 1 ? 'מיליון' : `${joinParts(under1000(millions)).replace(/^שניים$/, 'שני')} מיליון`)
  if (thousands) parts.push(thousands <= 10 ? THOUSANDS[thousands] : `${joinParts(under1000(thousands))} אלף`)
  // keep the units of the last group separate so the ו lands before the final word
  parts.push(...under1000(rest))
  return joinParts(parts)
}

export function priceToWords(price: string): string {
  const n = parseAmount(price)
  return n ? numberToHebrewWords(n) : ''
}

// ── Print HTML ──────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const val = (s: string, blank = '______________') => s.trim() ? esc(s) : `<span class="blank">${blank}</span>`

// More than 3 checks → two side-by-side tables so the contract stays on one page
function checkTables(checks: ContractCheck[]) {
  const row = (c: ContractCheck, i: number) =>
    `<tr><td>${i + 1}</td><td>${val(c.num, '________')}</td><td>${val(c.amount, '________')}</td><td>${c.date ? fmtDate(c.date) : '<span class="blank">___/___/____</span>'}</td></tr>`
  const table = (list: ContractCheck[], offset: number) =>
    `<table class="checks"><thead><tr><th>#</th><th>מס' שיק</th><th>סכום (ש"ח)</th><th>תאריך פירעון</th></tr></thead><tbody>${list.map((c, i) => row(c, i + offset)).join('')}</tbody></table>`
  if (checks.length <= 3) return table(checks, 0)
  const half = Math.ceil(checks.length / 2)
  return table(checks.slice(0, half), 0) + table(checks.slice(half), half)
}

export function payLineText(l: PayLine, html = true): string {
  const amount = l.amount.trim() ? (html ? `<b>${esc(l.amount)}</b>` : l.amount) : '________'
  const note = l.note.trim() ? ` – ${html ? esc(l.note) : l.note}` : ''
  return l.kind === 'cash'
    ? `סך ${amount} ש"ח במזומן${l.date ? ` בתאריך ${fmtDate(l.date)}` : ' במעמד החתימה'}${note}`
    : `סך ${amount} ש"ח בהעברה בנקאית לחשבון המוכר${l.date ? ` עד לתאריך ${fmtDate(l.date)}` : ' במעמד החתימה'}${note}`
}

export function contractHtml(raw: ContractData): string {
  const d = normalizeContract(raw)
  const party = (label: string, p: ContractParty) => `
    <div class="party">
      <div class="party-h">${label}</div>
      <div class="grid">
        <div><b>שם:</b> ${val(p.name)}</div>
        <div><b>ת.ז:</b> ${val(p.idNum, '__________')}</div>
        <div><b>טלפון:</b> ${val(p.phone, '__________')}</div>
        <div class="full"><b>כתובת:</b> ${val(p.address)}</div>
      </div>
    </div>`

  const parts = d.payLines.map(l => `<li>${payLineText(l)}</li>`)
  if (d.checksOn) {
    const sum = checksTotal(d)
    parts.push(`<li>${sum ? `סך <b>${fmtAmount(sum)}</b> ש"ח ` : ''}ב-${d.checks.length} ${d.checks.length === 1 ? 'שיק' : 'שיקים'} מעותדים המשוכים מחשבונו של הקונה, כדלקמן:
      <div class="checks-wrap">${checkTables(d.checks)}</div>
      <span class="small">הקונה ימציא למוכר בעת החתימה צילום תעודת זהות וצילום השיקים.</span></li>`)
  }
  const payment = parts.length
    ? `<p style="margin:3px 0">התמורה תשולם כדלקמן:</p><ul class="pay">${parts.join('')}</ul>`
    : `<p style="margin:3px 0">אופן התשלום: <span class="blank">______________________</span></p>`

  const clauses = visibleClauses(d)
  // the payment clause is always #3, right after the first two
  const numbered = [
    ...clauses.slice(0, 2).map(c => ({ c, html: '' })),
    { c: null as ContractClause | null, html: `<h4>3. התמורה ואופן התשלום</h4>
      <p class="it">תמורת הרכב ישלם הקונה למוכר סך כולל של <b>${val(d.price, '__________')}</b> ש"ח (במילים: ${val(d.priceWords, '______________________')} שקלים חדשים).</p>
      <div class="it">${payment}</div>` },
    ...clauses.slice(2).map(c => ({ c, html: '' })),
  ]
  const clausesHtml = numbered.map(({ c, html }, i) => c
    ? `<h4>${i + 1}. ${esc(c.title)}</h4>${c.items.filter(t => t.trim()).map((t, j) => `<p class="it">${itemLetter(j)}. ${esc(t)}</p>`).join('')}`
    : html).join('')

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>${esc(d.title)}${d.car.plate ? ' - ' + esc(d.car.plate) : ''}</title>
<style>
  @page { size: A4; margin: 9mm 12mm; }
  body { font-family: Arial, 'Heebo', sans-serif; color: #111; font-size: 12px; line-height: 1.38; margin: 0; }
  h1 { text-align: center; font-size: 19px; margin: 0 0 2px; }
  .sub { text-align: center; color: #444; padding-bottom: 6px; border-bottom: 2px solid #111; margin-bottom: 8px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
  .party { border: 1px solid #bbb; border-radius: 6px; padding: 3px 8px; }
  .party-h { font-weight: 700; border-bottom: 1px solid #ddd; margin-bottom: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px; }
  .grid > div:first-child, .grid .full { grid-column: 1 / -1; }
  .car { display: grid; grid-template-columns: 2fr 1fr 1fr; border: 1px solid #999; border-radius: 6px; text-align: center; margin: 4px 0; }
  .car div { padding: 3px 6px; border-left: 1px solid #ddd; } .car div:last-child { border-left: none; }
  .car small { display: block; color: #666; }
  .center { text-align: center; font-weight: 700; text-decoration: underline; margin: 8px 0 4px; }
  h4 { margin: 5px 0 0; font-size: 13px; }
  .it { margin: 1px 12px 1px 0; }
  .pay { margin: 2px 0; padding-right: 18px; } .pay li { margin: 1px 0; }
  .checks-wrap { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0; }
  .checks { border-collapse: collapse; flex: 1; font-size: 11.5px; }
  .checks th, .checks td { border: 1px solid #999; padding: 1px 5px; text-align: center; }
  .checks th { background: #f1f1f1; }
  .box { border: 1px solid #bbb; border-radius: 6px; padding: 6px 10px; }
  .small { font-size: 11.5px; color: #444; }
  .blank { color: #777; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 14px; page-break-inside: avoid; }
  .sig-line { margin-top: 26px; border-bottom: 1px dashed #555; }
</style></head><body>
  <h1>${esc(d.title)}</h1>
  <div class="sub">שנערך ונחתם ב${val(d.location, '__________')} בתאריך ${d.date ? fmtDate(d.date) : '<span class="blank">___/___/____</span>'}</div>
  <div class="parties">${party('בין (המוכר):', d.seller)}${party('לבין (הקונה):', d.buyer)}</div>
  <p><b>הואיל:</b> והמוכר הינו הבעלים הרשום והחוקי של כלי הרכב שפרטיו להלן:</p>
  <div class="car">
    <div><small>סוג ודגם</small><b>${val(d.car.model)}</b></div>
    <div><small>שנת ייצור</small><b>${val(d.car.year, '______')}</b></div>
    <div><small>מספר רישוי</small><b>${val(d.car.plate, '________')}</b>${d.car.vin.trim() ? `<small>מס' שלדה: ${esc(d.car.vin)}</small>` : ''}</div>
  </div>
  <p><b>והואיל:</b> והקונה מעוניין לרכוש את הרכב מהמוכר, והמוכר מעוניין למכור את הרכב לקונה, בתנאים המפורטים בהסכם זה;</p>
  <div class="center">לפיכך הוסכם והותנה בין הצדדים כדלקמן:</div>
  ${clausesHtml}
  <div class="center" style="margin-top:14px">ולראיה באו הצדדים על החתום:</div>
  <div class="sigs">
    <div><b>המוכר:</b> ${val(d.seller.name)}<div class="sig-line">חתימה:</div></div>
    <div><b>הקונה:</b> ${val(d.buyer.name)}<div class="sig-line">חתימה:</div></div>
  </div>
  <script>window.onload = () => { window.print() }</script>
</body></html>`
}
