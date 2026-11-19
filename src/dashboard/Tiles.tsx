import type { ReactNode } from 'react'
import { formatMinor } from '../lib/money'
import { Icon, type IconName } from '../ui/Icon'
import type { CurrencyTotals } from './totals'

/**
 * Total you owe, total owed to you, net balance: one line per currency, never added together.
 */
export function Tiles({
  totals,
  groupCount,
}: {
  totals: readonly CurrencyTotals[]
  groupCount: number
}) {
  const multi = totals.length > 1
  const first = totals[0]
  const netNote = multi
    ? 'kept per currency'
    : first && first.net > 0
      ? "you're owed overall"
      : first && first.net < 0
        ? 'you owe overall'
        : 'all square'

  return (
    <div className="mt-6 grid grid-cols-3 border-[1.5px] border-solid border-ink bg-sheet @max-[860px]/shell:grid-cols-1">
      <Tile
        icon="down"
        title="Total you owe"
        note={`across ${groupCount} group${groupCount === 1 ? '' : 's'}`}
      >
        {totals.map((t) => (
          <Line key={t.currency} code={multi ? t.currency : null} red={t.owe > 0}>
            {formatMinor(t.owe, t.currency)}
          </Line>
        ))}
      </Tile>
      <Tile icon="up" title="Total owed to you" note="waiting to come back">
        {totals.map((t) => (
          <Line key={t.currency} code={multi ? t.currency : null}>
            {formatMinor(t.owed, t.currency)}
          </Line>
        ))}
      </Tile>
      <Tile icon="net" title="Net balance" note={netNote}>
        {totals.map((t) => (
          <Line key={t.currency} code={multi ? t.currency : null} red={t.net < 0}>
            {t.net < 0
              ? `(${formatMinor(-t.net, t.currency)})`
              : t.net > 0
                ? `+${formatMinor(t.net, t.currency)}`
                : formatMinor(0, t.currency)}
          </Line>
        ))}
      </Tile>
    </div>
  )
}

function Tile({
  icon,
  title,
  note,
  children,
}: {
  icon: IconName
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <div className="border-r border-rule px-5 py-[18px] last:border-r-0 @max-[860px]/shell:border-r-0 @max-[860px]/shell:border-b @max-[860px]/shell:last:border-b-0">
      <span className="flex items-center gap-2 text-[.82rem] font-semibold text-muted">
        <Icon name={icon} className="size-4" />
        {title}
      </span>
      {children}
      <small className="text-[.85rem] text-muted">{note}</small>
    </div>
  )
}

function Line({
  code,
  red = false,
  children,
}: {
  code: string | null
  red?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`mt-1.5 block font-mono font-medium tabular-nums ${code ? 'text-[1.25rem]' : 'text-[1.7rem]'} ${red ? 'text-red' : ''}`}
    >
      {children}
      {code ? <i className="ml-2 font-body text-[.7rem] text-muted not-italic">{code}</i> : null}
    </span>
  )
}
