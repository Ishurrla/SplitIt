import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastContext } from './toastContext'

interface Toast {
  id: number
  message: string
  leaving: boolean
}

const VISIBLE_MS = 4800
const FADE_MS = 300

/** Corner notes, announced politely to screen readers. Each one fades out after ~5 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])

  const show = useCallback(
    (message: string) => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, message, leaving: false }])
      later(() => {
        setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
        later(() => {
          setToasts((list) => list.filter((t) => t.id !== id))
        }, FADE_MS)
      }, VISIBLE_MS)
    },
    [later],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
    }
  }, [])

  return (
    <ToastContext value={show}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="fixed top-[70px] right-4 z-60 flex w-[min(340px,calc(100%-32px))] flex-col gap-2.5"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`animate-rise rounded-pen border-pen border-l-[5px] border-l-biro bg-sheet px-3.5 py-[11px] text-[.95rem] text-ink shadow-offset-sm transition-opacity duration-300 ${
                t.leaving ? 'opacity-0' : ''
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}
