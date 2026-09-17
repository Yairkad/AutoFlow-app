'use client'

import { useOnScreenKeyboardPref } from '@/lib/hooks/useOnScreenKeyboardPref'

// Small persistent switch for the yard terminal: lets a workstation with a
// real keyboard turn off every custom on-screen keyboard/numpad in the app
// (so taps can't fight with typing), while tablets keep them on by default.
export default function KeyboardModeToggle() {
  const { enabled, setEnabled } = useOnScreenKeyboardPref()

  return (
    <button
      onClick={() => {
        if (enabled) (document.activeElement as HTMLElement)?.blur()
        setEnabled(!enabled)
      }}
      style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        zIndex: 9998,
        background: enabled ? '#334155' : '#0f766e',
        color: '#fff',
        border: 'none',
        borderRadius: '20px',
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: 700,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        opacity: 0.85,
      }}
      title={enabled ? 'סגור את כל המקלדות על המסך — הקלדה ממקלדת חיצונית בלבד' : 'הפעל בחזרה מקלדות מסך (למגע/טאבלט)'}
    >
      {enabled ? '⌨️ מקלדת מסך' : '🖥️ מקלדת חיצונית'}
    </button>
  )
}
