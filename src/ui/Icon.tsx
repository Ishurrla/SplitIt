// Line icons from the prototype, drawn on a 24px grid with the current text colour.
const PATHS = {
  dash: 'M4 11l8-7 8 7v9H4z M10 20v-6h4v6',
  groups:
    'M9 4.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6 M17 6.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z M16 14.2c3 .2 5 2.3 5 5.8',
  activity: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z M12 7v5l3.5 2',
  settings:
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z M16 16l5 5',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  tick: 'M4 12.5l5 5L20 6.5',
  plus: 'M12 5v14M5 12h14',
  invite: 'M10 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M3.5 20c0-3.6 2.9-6 6.5-6 M18 14v6M15 17h6',
  photo: 'M4 7h3l2-2h6l2 2h3v12H4z M12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
  go: 'M9 5l7 7-7 7',
  copy: 'M9 9h10v10H9z M5 15V5h10',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
