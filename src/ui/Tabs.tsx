import { useRef, type KeyboardEvent } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
}

interface TabsProps<T extends string> {
  /** Accessible name for the tab list, e.g. "Sign in mode". */
  label: string
  /** Prefix for element ids; the panel uses `${idBase}-panel` and `${idBase}-tab-${id}`. */
  idBase: string
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}

/**
 * Underlined tabs (the prototype's "Log in / Sign up" switch and activity filters).
 * Keyboard: Left/Right move between tabs, Home/End jump to the ends; only the active tab is in
 * the Tab order (roving tabindex), as the ARIA tabs pattern expects.
 */
export function Tabs<T extends string>({
  label,
  idBase,
  tabs,
  value,
  onChange,
  className = '',
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    const tab = tabs[next]
    if (!tab) return
    onChange(tab.id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-5 border-b border-rule ${className}`}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(tab.id)
            }}
            onKeyDown={(e) => {
              onKeyDown(e, i)
            }}
            className={`-mb-px border-b-[3px] border-solid pt-1.5 pb-2.5 font-semibold ${
              selected ? 'border-biro text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
