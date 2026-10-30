'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import MoreMenu from '@/components/ui/MoreMenu'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { fuzzyIncludes } from '@/lib/search/fuzzy'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import SupplierDetailsTab from '@/components/suppliers/SupplierDetailsTab'
import CustomerDetailsTab from '@/components/customers/CustomerDetailsTab'
import { waUrl, type Supplier } from '@/components/suppliers/shared'
import type { Customer } from '@/components/customers/shared'

type Kind = 'supplier' | 'customer'
interface Contact {
  key: string; kind: Kind; id: string; name: string; category: string | null; person: string | null; phone: string | null
  email: string | null; address: string | null; notes: string | null; opening: number
  bank?: string | null; brands?: string[]
}
type Filter = 'all' | Kind

const KIND_LABEL: Record<Kind, string> = { supplier: 'ספק', customer: 'לקוח' }
const toContact = (kind: Kind) => (r: Supplier | Customer): Contact => ({
  key: `${kind}:${r.id}`, kind, id: r.id, name: r.name, category: r.category, phone: r.phone,
  person: (kind === 'supplier' ? (r as Supplier).contact_name : (r as Customer).contact_name) ?? null,
  email: r.email, address: r.address, notes: r.notes, opening: Number(r.opening_balance) || 0,
  ...(kind === 'supplier' ? {
    bank: [(r as Supplier).bank_name, (r as Supplier).bank_branch && `סניף ${(r as Supplier).bank_branch}`, (r as Supplier).bank_account && `חשבון ${(r as Supplier).bank_account}`].filter(Boolean).join(' · ') || null,
    brands: (r as Supplier).brands ?? [],
  } : {}),
})

// vCard 3.0 — the person (when known) under the company, so the phone's contacts show both
function vcard(c: Contact) {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${esc(c.person ? `${c.person} - ${c.name}` : c.name)}`,
    `N:${esc(c.person ?? c.name)};;;;`,
    `ORG:${esc(c.name)}`,
    c.category && `TITLE:${esc(c.category)}`,
    c.phone && `TEL;TYPE=WORK,VOICE:${c.phone}`,
    c.email && `EMAIL;TYPE=WORK:${c.email}`,
    c.address && `ADR;TYPE=WORK:;;${esc(c.address)};;;;`,
    `NOTE:${esc(`${KIND_LABEL[c.kind]}${c.notes ? ` · ${c.notes}` : ''}`)}`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n')
}

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Suppliers and ledger customers in one list: company, category, contact person and phone at a
// glance; email, address, bank and the rest wait in the card under "פרטים נוספים".
export default function ContactsClient() {
  const sb = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const tenantId = profile?.tenantId ?? ''
  const mods = profile?.allowedModules ?? []
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const canSup = isAdmin || mods.includes('suppliers')
  const canCus = isAdmin || mods.includes('customers')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [supCats, setSupCats] = useState<string[]>([])
  const [cusCats, setCusCats] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ kind: Kind; id: string | null } | null>(null)

  const load = useCallback(async () => {
    if (!tenantId) return
    const [s, c, sc, cc] = await Promise.all([
      canSup ? sb.from('suppliers').select('*').eq('tenant_id', tenantId).order('name') : Promise.resolve({ data: [] }),
      canCus ? sb.from('customers').select('*').eq('tenant_id', tenantId).order('name') : Promise.resolve({ data: [] }),
      canSup ? sb.from('supplier_categories').select('name').eq('tenant_id', tenantId).order('name') : Promise.resolve({ data: [] }),
      canCus ? sb.from('customer_categories').select('name').eq('tenant_id', tenantId).order('name') : Promise.resolve({ data: [] }),
    ])
    setSuppliers((s.data ?? []) as Supplier[]); setCustomers((c.data ?? []) as Customer[])
    setSupCats(((sc.data ?? []) as { name: string }[]).map(r => r.name)); setCusCats(((cc.data ?? []) as { name: string }[]).map(r => r.name))
    setLoaded(true)
  }, [sb, tenantId, canSup, canCus])
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])
  useLiveRefresh(load)

  // ?open=<id> (from the accounts screen) opens that card
  useEffect(() => {
    if (!loaded) return
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id) return
    const t = setTimeout(() => {
      setOpenKey(suppliers.some(x => x.id === id) ? `supplier:${id}` : `customer:${id}`)
      window.history.replaceState(null, '', window.location.pathname)
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const all = useMemo(() => [...suppliers.map(toContact('supplier')), ...customers.map(toContact('customer'))]
    .sort((a, b) => a.name.localeCompare(b.name, 'he')), [suppliers, customers])
  const shown = all.filter(c => (filter === 'all' || c.kind === filter) &&
    (!search.trim() || fuzzyIncludes(`${c.name} ${c.person ?? ''} ${c.category ?? ''} ${c.phone ?? ''}`, search)))
  const open = all.find(c => c.key === openKey) ?? null
  const count = (k: Filter) => k === 'all' ? all.length : all.filter(c => c.kind === k).length

  const allShownPicked = shown.length > 0 && shown.every(c => picked.has(c.key))
  const togglePick = (key: string) => setPicked(p => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const toggleAllShown = () => setPicked(p => {
    const n = new Set(p)
    if (allShownPicked) shown.forEach(c => n.delete(c.key)); else shown.forEach(c => n.add(c.key))
    return n
  })

  function exportVcf(list: Contact[]) {
    if (!list.length) return
    download(`אנשי-קשר-${list.length}.vcf`, list.map(vcard).join('\r\n'), 'text/vcard;charset=utf-8')
  }
  function exportXlsx(list: Contact[]) {
    if (!list.length) return
    const ws = XLSX.utils.json_to_sheet(list.map(c => ({
      סוג: KIND_LABEL[c.kind], חברה: c.name, קטגוריה: c.category ?? '', 'איש קשר': c.person ?? '', טלפון: c.phone ?? '',
      מייל: c.email ?? '', כתובת: c.address ?? '', 'פרטי בנק': c.bank ?? '', 'יתרת פתיחה': c.opening, הערות: c.notes ?? '',
    })))
    ws['!cols'] = [6, 24, 16, 18, 14, 26, 26, 30, 10, 30].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'אנשי קשר')
    XLSX.writeFile(wb, `אנשי-קשר-${list.length}.xlsx`)
  }
  const pickedList = all.filter(c => picked.has(c.key))

  async function remove(c: Contact) {
    if (!(await confirm({ msg: `למחוק את ${c.kind === 'supplier' ? 'הספק' : 'הלקוח'} "${c.name}"?\nהחשבוניות והתשלומים שלו לא יימחקו.`, variant: 'danger', confirmLabel: 'מחק' }))) return
    const { error } = await sb.from(c.kind === 'supplier' ? 'suppliers' : 'customers').delete().eq('id', c.id)
    if (error) { showToast('שגיאה במחיקה', 'error'); return }
    showToast('נמחק', 'success'); setOpenKey(null); load()
  }

  const call = (c: Contact) => c.phone && <a href={`tel:${c.phone}`} className="ct-ico" title="חיוג" aria-label={`חיוג ל${c.name}`} onClick={e => e.stopPropagation()}>📞</a>
  const wa = (c: Contact) => c.phone && <a href={waUrl(c.phone, `שלום ${c.person ?? c.name}, `)} target="_blank" rel="noopener noreferrer" className="ct-ico" title="וואטסאפ" aria-label={`וואטסאפ ל${c.name}`} onClick={e => e.stopPropagation()}>💬</a>

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        title="אנשי קשר"
        subtitle="ספקים ולקוחות — מי לדבר איתו ובאיזה מספר"
        actions={<>
          <MoreMenu label="ייצוא ▾" actions={[
            { key: 'vcf', label: `קובץ אנשי קשר (vCard) — ${picked.size ? `${picked.size} נבחרו` : `כל ה-${shown.length} המוצגים`}`, icon: '📇', onClick: () => exportVcf(picked.size ? pickedList : shown) },
            { key: 'xls', label: `אקסל — ${picked.size ? `${picked.size} נבחרו` : `כל ה-${shown.length} המוצגים`}`, icon: '📊', onClick: () => exportXlsx(picked.size ? pickedList : shown) },
          ]} />
          {canSup && canCus
            ? <MoreMenu label="+ איש קשר ▾" actions={[
                { key: 's', label: 'ספק חדש', icon: '🏭', onClick: () => setEditing({ kind: 'supplier', id: null }) },
                { key: 'c', label: 'לקוח חדש', icon: '👤', onClick: () => setEditing({ kind: 'customer', id: null }) },
              ]} />
            : <Button onClick={() => setEditing({ kind: canSup ? 'supplier' : 'customer', id: null })}>+ {canSup ? 'ספק' : 'לקוח'}</Button>}
        </>}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="form-input" type="search" aria-label="חיפוש" placeholder="חיפוש חברה, איש קשר, קטגוריה או טלפון..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 240px', maxWidth: 380, margin: 0 }} />
        {canSup && canCus && (
          <div role="group" aria-label="סוג" className="ct-seg">
            {(['all', 'supplier', 'customer'] as Filter[]).map(k => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {k === 'all' ? 'הכל' : k === 'supplier' ? 'ספקים' : 'לקוחות'} ({count(k)})
              </button>
            ))}
          </div>
        )}
      </div>

      {picked.size > 0 && (
        <div className="ct-sel">
          <b>{picked.size} נבחרו</b>
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => exportVcf(pickedList)}>ייצוא vCard ({picked.size})</Button>
            <Button size="sm" variant="secondary" onClick={() => exportXlsx(pickedList)}>ייצוא אקסל ({picked.size})</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>נקה בחירה</Button>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div className="ct-list" style={{ flex: 1, minWidth: 0 }}>
          <div className="ct-row ct-th">
            <span><input type="checkbox" checked={allShownPicked} onChange={toggleAllShown} aria-label="סמן את כל המוצגים" /></span>
            <span>חברה</span><span>קטגוריה</span><span>איש קשר</span><span>טלפון</span><span />
          </div>
          {!loaded && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>}
          {loaded && shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>אין אנשי קשר להצגה</div>}
          {shown.map(c => (
            <div key={c.key} className={`ct-row${openKey === c.key ? ' on' : ''}`} role="button" tabIndex={0}
              onClick={() => setOpenKey(c.key)} onKeyDown={e => { if (e.key === 'Enter') setOpenKey(c.key) }}>
              <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.key)} onChange={() => togglePick(c.key)} aria-label={`בחר ${c.name}`} /></span>
              <span className="ct-nm">{c.name}<span className={`ct-tag ${c.kind}`}>{KIND_LABEL[c.kind]}</span></span>
              <span className="ct-cat">{c.category || '—'}</span>
              <span className="ct-person">{c.person || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</span>
              <span className="ct-ph">{c.phone || '—'}</span>
              <span className="ct-acts">{call(c)}{wa(c)}</span>
            </div>
          ))}
        </div>

        {open && (
          <>
            <div className="ct-backdrop" onClick={() => setOpenKey(null)} />
            <aside className="ct-card" aria-label={`כרטיס ${open.name}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{open.name}</h2>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span className={`ct-tag ${open.kind}`} style={{ marginInlineStart: 0 }}>{KIND_LABEL[open.kind]}</span>
                    {open.category && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{open.category}</span>}
                  </div>
                </div>
                <RowActionsMenu align="end" actions={[
                  { key: 'edit', label: 'עריכה', icon: '✏️', onClick: () => setEditing({ kind: open.kind, id: open.id }) },
                  { key: 'del', label: 'מחיקה', icon: '🗑️', danger: true, onClick: () => remove(open) },
                ]} />
                <button type="button" onClick={() => setOpenKey(null)} aria-label="סגור" className="ct-x">✕</button>
              </div>

              <div className="ct-who">
                <span style={{ fontWeight: 700, fontSize: 15 }}>{open.person || 'אין איש קשר'}</span>
                {open.phone && <span className="ct-ph" style={{ fontSize: 17 }}>{open.phone}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {open.phone && <a className="ct-btn" href={`tel:${open.phone}`}>📞 חיוג</a>}
                {open.phone && <a className="ct-btn" href={waUrl(open.phone, `שלום ${open.person ?? open.name}, `)} target="_blank" rel="noopener noreferrer">💬 וואטסאפ</a>}
                <button type="button" className="ct-btn" onClick={() => setEditing({ kind: open.kind, id: open.id })}>✏️ עריכה</button>
              </div>

              <details className="ct-more">
                <summary>פרטים נוספים</summary>
                <dl>
                  {open.email && <><dt>מייל</dt><dd>{open.email}</dd></>}
                  {open.address && <><dt>כתובת</dt><dd>{open.address}</dd></>}
                  {open.bank && <><dt>פרטי בנק</dt><dd>{open.bank}</dd></>}
                  {!!open.opening && <><dt>יתרת פתיחה</dt><dd>₪{open.opening.toLocaleString('he-IL')}</dd></>}
                  {!!open.brands?.length && <><dt>חברות צמיגים</dt><dd>{open.brands.join(' · ')}</dd></>}
                  {open.notes && <><dt>הערות</dt><dd style={{ whiteSpace: 'pre-line' }}>{open.notes}</dd></>}
                  {!open.email && !open.address && !open.bank && !open.opening && !open.brands?.length && !open.notes && <dd style={{ gridColumn: '1 / -1', color: 'var(--text-muted)' }}>אין פרטים נוספים</dd>}
                </dl>
              </details>

              <Link className="ct-btn" style={{ textAlign: 'center' }}
                href={`/accounts?tab=${open.kind === 'supplier' ? 'suppliers' : 'customers'}&open=${open.id}`}>
                פתח בחשבונות ←
              </Link>
            </aside>
          </>
        )}
      </div>

      {/* Add / edit — the suppliers' / customers' own forms */}
      {editing?.kind === 'supplier' && (
        <SupplierDetailsTab mode="edit" key={`s-${editing.id ?? 'new'}`} tenantId={tenantId} suppliers={suppliers} debts={[]} categories={supCats}
          scheduledPayments={[]} openId={editing.id} onOpenTracking={() => {}} reload={load} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === 'customer' && (
        <CustomerDetailsTab mode="edit" key={`c-${editing.id ?? 'new'}`} tenantId={tenantId} customers={customers} debts={[]} payments={[]}
          recurringItems={[]} customerActions={[]} categories={cusCats} openId={editing.id} onOpenTracking={() => {}} reload={load} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
