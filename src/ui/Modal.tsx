import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  /** Optional line under the title. */
  description?: ReactNode
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog with the prototype's look (pen border, 8px offset shadow).
 * - Focus moves to the first field (or button) on open and back to the opener on close.
 * - Tab and Shift+Tab cycle inside the dialog; the page behind is inert.
 * - Esc and a click on the dimmed backdrop close it.
 */
export function Modal({ title, description, onClose, children }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const first =
      panel?.querySelector<HTMLElement>(
        'input:not([readonly]):not([type="file"]), select, textarea',
      ) ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem?.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      root?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(15,15,14,.5)] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="max-h-[92%] w-[min(500px,100%)] animate-rise overflow-auto rounded-pen border-pen bg-sheet p-7 text-ink shadow-offset-lg focus:outline-none"
      >
        <h3 id={titleId} className="text-[1.8rem]">
          {title}
        </h3>
        {description ? (
          <p id={descriptionId} className="mt-1 text-muted">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}
