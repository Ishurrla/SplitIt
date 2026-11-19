import { useId } from 'react'
import { formatMinor, type CurrencyCode } from '../lib/money'
import { compactMinor, niceTop } from './chartScale'

// Hand-built bar chart, sized like the prototype's.
const W = 560
const H = 230
const L = 62
const R = 8
const T = 24
const B = 30

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * My share of spending per month in one currency: past months hatched, the current month solid
 * blue with its amount on top. Screen readers get every month's figure in the label.
 */
export function SpendingChart({
  months,
  values,
  currency,
}: {
  months: readonly string[]
  values: readonly number[]
  currency: CurrencyCode
}) {
  const hatch = `${useId().replace(/:/g, '')}-hatch`
  const top = niceTop(Math.max(0, ...values), currency)
  const plotW = W - L - R
  const plotH = H - T - B
  const slot = plotW / Math.max(1, months.length)
  const barW = Math.min(40, slot * 0.6)
  const label = `Your share of spending by month, in ${currency}: ${months
    .map((m, i) => `${monthLabel(m)} ${formatMinor(values[i] ?? 0, currency)}`)
    .join(', ')}.`

  const gridlines = [
    { y: T + plotH, text: '0', solid: true },
    { y: T + plotH / 2, text: compactMinor(Math.floor(top / 2), currency), solid: false },
    { y: T, text: compactMinor(top, currency), solid: false },
  ]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="mt-3.5 block h-auto w-full text-ink"
    >
      <defs>
        <pattern
          id={hatch}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill="var(--color-sheet)" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeWidth="2" />
        </pattern>
      </defs>
      {gridlines.map((g) => (
        <g key={g.y}>
          <line
            x1={L}
            x2={W - R}
            y1={g.y}
            y2={g.y}
            stroke={g.solid ? 'var(--color-ink)' : 'var(--color-rule)'}
            strokeDasharray={g.solid ? undefined : '3 4'}
          />
          <text x={L - 8} y={g.y + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">
            {g.text}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const value = values[i] ?? 0
        const h = (plotH * value) / top
        const x = L + slot * i + (slot - barW) / 2
        const y = T + plotH - h
        const current = i === months.length - 1
        return (
          <g key={m}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={current ? 'var(--color-biro)' : `url(#${hatch})`}
              stroke={current ? 'var(--color-biro)' : 'currentColor'}
              strokeWidth="1.5"
            />
            <text
              x={x + barW / 2}
              y={H - 10}
              textAnchor="middle"
              className={`font-mono text-[11px] ${current ? 'fill-ink font-medium' : 'fill-muted'}`}
            >
              {monthLabel(m)}
            </text>
            {current ? (
              <text
                x={x + barW / 2}
                y={y - 7}
                textAnchor="middle"
                className="fill-ink font-mono text-[11px] font-medium"
              >
                {formatMinor(value, currency)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
