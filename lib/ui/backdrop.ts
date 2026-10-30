import type { FormEvent, MouseEvent } from 'react'

/**
 * Props for a hand-built modal backdrop that wraps its window: a click outside closes it only
 * while nothing was typed inside — once a field was touched, only ✕ / ביטול close it.
 */
export function guardedBackdrop(onClose: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && !e.currentTarget.dataset.dirty) onClose()
    },
    onInput: (e: FormEvent<HTMLElement>) => { e.currentTarget.dataset.dirty = '1' },
  }
}
