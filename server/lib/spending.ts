// "Your share of spending, by month" for the dashboard chart. Pure, so it can be tested without
// Firestore. Amounts stay integers in each currency's minor units; currencies are never mixed.

export interface ShareSource {
  currency: string
  createdAt: Date
  splits: Record<string, number>
}

/** "2026-11" for the month `date` falls in, in `timeZone` (so 00:30 on 1 Nov in Lagos is November). */
export function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${year}-${month}`
}

/** The last `count` month keys ending with the current one, oldest first. */
export function lastMonths(now: Date, timeZone: string, count: number): string[] {
  const [y, m] = monthKey(now, timeZone).split('-').map(Number) as [number, number]
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
  }
  return keys
}

/**
 * Adds up `me`'s share (splits[me], never the whole amount) per currency and month.
 * Every currency in `currencies` gets a row of zeros even with no spending; expenses outside
 * the months asked for, or that `me` isn't part of, are ignored.
 */
export function bucketSpending(
  expenses: readonly ShareSource[],
  me: string,
  months: readonly string[],
  timeZone: string,
  currencies: readonly string[],
): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(
    currencies.map((c) => [c, months.map(() => 0)]),
  )
  for (const e of expenses) {
    const share = e.splits[me]
    if (!share) continue
    const index = months.indexOf(monthKey(e.createdAt, timeZone))
    if (index === -1) continue
    const row = (out[e.currency] ??= months.map(() => 0))
    row[index] = (row[index] ?? 0) + share
  }
  return out
}

/** True for a time zone this runtime knows, like "Africa/Lagos". */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}
