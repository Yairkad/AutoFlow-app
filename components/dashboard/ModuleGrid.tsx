'use client'

import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'

type Module = {
  id: string
  href: string
  label: string
  icon: string
  color: string
  description: string
}

type Group = {
  id: string
  label: string
  modules: Module[]
}

const INITIAL_GROUPS: Group[] = [
  {
    id: 'finance',
    label: '💼 ניהול פיננסי',
    modules: [
      { id: 'expenses',   href: '/expenses',   label: 'הוצאות',     icon: '💰', color: 'var(--primary)', description: 'הכנסות, הוצאות ורווח חודשי' },
      { id: 'billing',    href: '/billing',    label: 'חשבונות',    icon: '🧾', color: '#2563eb', description: 'חיובים חודשיים קבועים ותשלומים' },
      { id: 'debts',      href: '/debts',      label: 'חובות',      icon: '💳', color: 'var(--danger)', description: 'חובות לקוחות וחובות לספקים' },
      { id: 'employees',  href: '/employees',  label: 'עובדים',     icon: '👷', color: '#7c3aed', description: 'ניהול שכר, בונוסים וניכויים' },
      { id: 'suppliers',  href: '/suppliers',  label: 'ספקים',      icon: '🏭', color: '#64748b', description: 'ספקים פעילים, הזמנות וחובות' },
      { id: 'documents',  href: '/documents',  label: 'מסמכים',     icon: '📄', color: '#475569', description: 'תבניות הדפסה, הצהרות וטפסים' },
    ],
  },
  {
    id: 'inventory',
    label: '🔧 מלאי ועבודות',
    modules: [
      { id: 'products',    href: '/products',    label: 'מוצרים',      icon: '📦', color: 'var(--warning)', description: 'אביזרים, חלקים ומחירי מכירה' },
      { id: 'tires',       href: '/tires',       label: 'צמיגים',      icon: '🔘', color: '#0891b2', description: 'מלאי צמיגים לפי מידה ועונה' },
      { id: 'alignment',   href: '/alignment',   label: 'פרונט',       icon: '🔩', color: '#ea580c', description: 'עבודות כיוון גלגלים ופרונט' },
      { id: 'cars',        href: '/cars',        label: 'רכבים',       icon: '🚗', color: '#059669', description: 'קניה ומכירה של רכבים' },
      { id: 'inspections',   href: '/inspections',   label: 'בדיקות קניה',  icon: '📝', color: '#0369a1', description: 'דוח בדיקת רכב לפני קניה' },
      { id: 'test-transfer', href: '/test-transfer', label: 'שינוע לטסטים', icon: '🚐', color: '#d97706', description: 'שינוע רכבים לבדיקת רישוי, תיקונים וחיובים' },
    ],
  },
  {
    id: 'general',
    label: '📋 כללי',
    modules: [
      { id: 'quotes',    href: '/quotes',    label: 'הצעות מחיר', icon: '💬', color: '#db2777', description: 'הצעות מחיר לצמיגים וחלקים' },
      { id: 'reminders', href: '/reminders', label: 'תזכורות',    icon: '🔔', color: '#ca8a04', description: 'תזכורות לפי תאריך ועדיפות' },
      { id: 'settings',  href: '/settings',  label: 'הגדרות',     icon: '⚙️', color: '#334155', description: 'שם עסק, לוגו וחיבורים' },
    ],
  },
]

// Live stats fetched from Supabase
type StatsMap = Record<string, string>

function useModuleStats(): StatsMap {
  const [stats, setStats] = useState<StatsMap>({})
  const supabase = useRef(createClient()).current

  useEffect(() => {
    async function fetch() {
      const [
        custDebts, suppDebts, suppliers, employees,
        products, tires, quotes, reminders,
        incomeRows, expenseRows, billingRows,
      ] = await Promise.all([
        supabase.from('customer_debts').select('id').eq('is_closed', false),
        supabase.from('supplier_debts').select('id').eq('is_closed', false),
        supabase.from('suppliers').select('id'),
        supabase.from('employees').select('id').eq('is_active', true),
        supabase.from('products').select('qty'),
        supabase.from('tires').select('qty'),
        supabase.from('quotes').select('id').eq('status', 'open'),
        supabase.from('reminders').select('id').eq('is_done', false),
        supabase.from('income').select('amount').gte('date', new Date().toISOString().slice(0, 7) + '-01'),
        supabase.from('expenses').select('amount').gte('date', new Date().toISOString().slice(0, 7) + '-01'),
        supabase.from('billing_entries').select('amount, payments:billing_entry_payments(amount)').eq('month', new Date().toISOString().slice(0, 7)),
      ])

      const custCount = custDebts.data?.length ?? 0
      const suppCount = suppDebts.data?.length ?? 0
      const supCount  = suppliers.data?.length ?? 0
      const empCount  = employees.data?.length ?? 0
      const prodQty   = (products.data ?? []).reduce((s, r) => s + r.qty, 0)
      const tireTypes = tires.data?.length ?? 0
      const tireQty   = (tires.data ?? []).reduce((s, r) => s + r.qty, 0)
      const qCount    = quotes.data?.length ?? 0
      const remCount  = reminders.data?.length ?? 0
      const income    = (incomeRows.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const expense   = (expenseRows.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const profit    = income - expense
      const fmtIL     = (n: number) => '₪' + Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })

      const billingEntries = (billingRows.data ?? []) as { amount: number; payments: { amount: number }[] }[]
      const billingPending = billingEntries.filter(e => {
        const paid = e.payments.reduce((s, p) => s + Number(p.amount), 0)
        return paid < Number(e.amount)
      }).length

      setStats({
        billing:    billingPending ? `${billingPending} רשומות ממתינות` : 'הכל שולם',
        expenses:   `${fmtIL(profit)} ${profit >= 0 ? 'רווח' : 'הפסד'} החודש`,
        debts:      custCount || suppCount ? `${custCount} לקוחות · ${suppCount} ספקים` : 'אין חובות פתוחים',
        suppliers:  supCount ? `${supCount} ספקים` : 'לא הוזנו ספקים',
        employees:  empCount ? `${empCount} עובדים פעילים` : 'אין עובדים פעילים',
        products:   prodQty  ? `${prodQty} פריטים במלאי`  : 'מלאי ריק',
        tires:      tireTypes ? `${tireTypes} סוגי צמיג · ${tireQty} יחידות` : 'מלאי ריק',
        quotes:     qCount   ? `${qCount} הצעות פתוחות`  : 'אין הצעות פתוחות',
        reminders:  remCount ? `${remCount} תזכורות ממתינות` : 'הכל מטופל',
      })
    }
    fetch()
  }, [supabase])

  return stats
}

// Single card component (sortable)
function ModuleCard({ mod, editMode, stat }: { mod: Module; editMode: boolean; stat?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: mod.id, disabled: !editMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...(editMode ? { ...attributes, ...listeners } : {})}>
      <a
        href={editMode ? undefined : mod.href}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          borderTop: `3px solid ${mod.color}`,
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          cursor: editMode ? 'grab' : 'pointer',
          transition: 'box-shadow .15s, transform .15s',
          textDecoration: 'none',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!editMode) {
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'
            ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
          }
        }}
        onMouseLeave={e => {
          if (!editMode) {
            (e.currentTarget as HTMLElement).style.boxShadow = 'none'
            ;(e.currentTarget as HTMLElement).style.transform = 'none'
          }
        }}
      >
        {editMode && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'left' }}>⠿</div>
        )}
        <div style={{ fontSize: '28px' }}>{mod.icon}</div>
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{mod.label}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{mod.description}</div>
        <div style={{ color: mod.color, fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
          {stat ?? '—'}
        </div>
      </a>
    </div>
  )
}

// Drag overlay card (visual while dragging)
function OverlayCard({ mod }: { mod: Module }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `2px solid ${mod.color}`,
      borderRadius: 'var(--radius)',
      borderTop: `3px solid ${mod.color}`,
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      boxShadow: '0 8px 32px rgba(0,0,0,.15)',
      cursor: 'grabbing',
      minWidth: '140px',
      opacity: 0.95,
    }}>
      <div style={{ fontSize: '28px' }}>{mod.icon}</div>
      <div style={{ fontWeight: 600, fontSize: '14px' }}>{mod.label}</div>
    </div>
  )
}

export default function ModuleGrid() {
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS)
  const [editMode, setEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const stats = useModuleStats()

  const updateGroupLabel = (groupId: string, newLabel: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, label: newLabel } : g))
  }

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  const findGroup = (moduleId: string) =>
    groups.find(g => g.modules.some(m => m.id === moduleId))

  const findModule = (moduleId: string): Module | undefined => {
    for (const g of groups) {
      const m = g.modules.find(m => m.id === moduleId)
      if (m) return m
    }
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return

    const activeGroupId = findGroup(active.id as string)?.id
    const overGroupId = findGroup(over.id as string)?.id ?? over.id as string

    if (!activeGroupId || activeGroupId === overGroupId) return

    setGroups(prev => {
      const activeGroup = prev.find(g => g.id === activeGroupId)!
      const overGroup = prev.find(g => g.id === overGroupId) ??
        prev.find(g => g.modules.some(m => m.id === over.id))!

      const movingModule = activeGroup.modules.find(m => m.id === active.id)!
      const overIndex = overGroup.modules.findIndex(m => m.id === over.id)

      return prev.map(g => {
        if (g.id === activeGroupId) {
          return { ...g, modules: g.modules.filter(m => m.id !== active.id) }
        }
        if (g.id === overGroup.id) {
          const newModules = [...g.modules]
          const insertAt = overIndex === -1 ? newModules.length : overIndex
          newModules.splice(insertAt, 0, movingModule)
          return { ...g, modules: newModules }
        }
        return g
      })
    })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const groupId = findGroup(active.id as string)?.id
    if (!groupId) return

    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const oldIndex = g.modules.findIndex(m => m.id === active.id)
      const newIndex = g.modules.findIndex(m => m.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return g
      const newModules = [...g.modules]
      newModules.splice(newIndex, 0, newModules.splice(oldIndex, 1)[0])
      return { ...g, modules: newModules }
    }))
  }

  const activeModule = activeId ? findModule(activeId) : null

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {groups.map(group => (
            <div
              key={group.id}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${editMode ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '16px',
                transition: 'border-color .2s',
              }}
            >
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                {editMode ? (
                  <input
                    value={group.label}
                    onChange={e => updateGroupLabel(group.id, e.target.value)}
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      outline: 'none',
                      padding: '0 2px',
                      width: '160px',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <span>{group.label}</span>
                )}
                {group.id === 'finance' && (
                  <button
                    onClick={() => setEditMode(v => !v)}
                    title={editMode ? 'סיום עריכה' : 'ערוך סידור'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#94a3b8',
                      opacity: editMode ? 1 : 0.45,
                      padding: '2px 6px',
                      borderRadius: '6px',
                    }}
                  >
                    {editMode ? '✅' : '✏️'}
                  </button>
                )}
              </div>
              <SortableContext
                items={group.modules.map(m => m.id)}
                strategy={rectSortingStrategy}
              >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '12px',
                }}>
                  {group.modules.map(mod => (
                    <ModuleCard key={mod.id} mod={mod} editMode={editMode} stat={stats[mod.id]} />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeModule && <OverlayCard mod={activeModule} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
