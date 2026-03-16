'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function UiDemo() {
  const [modalOpen, setModalOpen] = useState(false)
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const handleDelete = async () => {
    const ok = await confirm({ msg: 'למחוק את הרשומה? פעולה זו לא ניתנת לביטול.', icon: '🗑️' })
    if (ok) showToast('נמחק בהצלחה', 'success')
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700 }}>🎨 Design System – תצוגה מקדימה</h1>

      {/* Buttons */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Buttons</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">💾 שמור</Button>
          <Button variant="secondary">ביטול</Button>
          <Button variant="danger">🗑️ מחק</Button>
          <Button variant="outline">ייצוא Excel</Button>
          <Button variant="ghost">פרטים נוספים</Button>
          <Button variant="primary" size="sm">קטן</Button>
          <Button variant="primary" size="lg">גדול</Button>
          <Button variant="primary" loading>שומר...</Button>
          <Button variant="primary" disabled>מושבת</Button>
        </div>
      </section>

      {/* Inputs */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Inputs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Input label="שם לקוח" placeholder="הזן שם..." />
          <Input label="סכום" placeholder="0.00" prefix="₪" />
          <Input label="טלפון" placeholder="050-0000000" suffix="📱" />
          <Input label="שדה עם שגיאה" placeholder="..." error="שדה חובה" />
        </div>
      </section>

      {/* Badges */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Badges</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Badge variant="green">שולם</Badge>
          <Badge variant="yellow">חלקי</Badge>
          <Badge variant="red">פתוח</Badge>
          <Badge variant="blue">בטיפול</Badge>
          <Badge variant="orange">מוכן</Badge>
          <Badge variant="gray">בוטל</Badge>
        </div>
      </section>

      {/* Cards */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Cards</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          <Card accent="var(--primary)">
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>סה״כ הכנסות</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>₪12,400</div>
          </Card>
          <Card accent="var(--danger)">
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>חובות פתוחים</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--danger)' }}>₪3,200</div>
          </Card>
          <Card accent="var(--accent)">
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>הצעות מחיר</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>7 פתוחות</div>
          </Card>
        </div>
      </section>

      {/* Toast */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Toast</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { label: '✅ הצלחה', msg: 'נשמר בהצלחה!', type: 'success' as const, bg: '#16a34a' },
            { label: '❌ שגיאה', msg: 'אירעה שגיאה', type: 'error' as const, bg: '#dc2626' },
            { label: 'ℹ️ מידע', msg: 'נא לשים לב', type: 'info' as const, bg: '#2563eb' },
          ].map(t => (
            <button
              key={t.type}
              onClick={() => showToast(t.msg, t.type)}
              style={{
                background: t.bg,
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* Modal */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Modal</h2>
        <Button variant="outline" onClick={() => setModalOpen(true)}>פתח Modal</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="הוספת לקוח חדש"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>ביטול</Button>
              <Button variant="primary" onClick={() => { setModalOpen(false); showToast('נשמר!') }}>💾 שמור</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label="שם לקוח" placeholder="הזן שם..." />
            <Input label="טלפון" placeholder="050-0000000" />
            <Input label="לוחית רישוי" placeholder="12-345-67" />
          </div>
        </Modal>
      </section>

      {/* Confirm */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Confirm Dialog</h2>
        <Button variant="danger" onClick={handleDelete}>🗑️ מחק רשומה</Button>
      </section>

      {/* Empty State */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Empty State</h2>
        <Card>
          <EmptyState
            icon="📭"
            title="אין חובות פתוחים"
            subtitle="כל החובות שולמו. כשיתווסף חוב חדש הוא יופיע כאן."
            action={<Button variant="primary">+ הוסף חוב</Button>}
          />
        </Card>
      </section>
    </div>
  )
}
