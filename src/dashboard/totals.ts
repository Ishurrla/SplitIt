import type { CurrencyCode } from '../lib/money'

export interface CurrencyTotals {
  currency: CurrencyCode
  /** What I owe across groups in this currency (a positive number). */
  owe: number
  /** What I'm owed across groups in this currency. */
  owed: number
  /** owed − owe. */
  net: number
  groups: number
}

/**
 * My position per currency, from each group's stored balance. Amounts are only ever added to
 * others in the same currency: there is no total across currencies and nothing is converted.
 * The default currency comes first, then the rest by code.
 */
export function totalsByCurrency(
  groups: readonly { currency: CurrencyCode; balances: Record<string, number> }[],
  me: string,
  defaultCurrency: CurrencyCode,
): CurrencyTotals[] {
  const byCurrency = new Map<CurrencyCode, CurrencyTotals>()
  for (const g of groups) {
    const t = byCurrency.get(g.currency) ?? {
      currency: g.currency,
      owe: 0,
      owed: 0,
      net: 0,
      groups: 0,
    }
    const mine = g.balances[me] ?? 0
    if (mine > 0) t.owed += mine
    if (mine < 0) t.owe -= mine
    t.net = t.owed - t.owe
    t.groups += 1
    byCurrency.set(g.currency, t)
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency === defaultCurrency
      ? -1
      : b.currency === defaultCurrency
        ? 1
        : a.currency.localeCompare(b.currency),
  )
}
