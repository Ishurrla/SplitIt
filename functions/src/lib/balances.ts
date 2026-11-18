// Balance arithmetic, kept pure so it can be unit-tested without Firestore.
// A balance is a member's net position in minor units: positive means the group owes them,
// negative means they owe the group. A group's balances always add up to zero.

export type Balances = Record<string, number>

export interface ExpenseMoney {
  amountMinor: number
  paidBy: string
  splits: Record<string, number>
}

/** What one expense does to balances: the payer is owed the amount, everyone in it owes their share. */
export function expenseEffect(e: ExpenseMoney): Balances {
  const effect: Balances = { [e.paidBy]: e.amountMinor }
  for (const [uid, share] of Object.entries(e.splits)) effect[uid] = (effect[uid] ?? 0) - share
  return effect
}

/** balances + sign × effect, as a new object. */
export function applyEffect(balances: Balances, effect: Balances, sign: 1 | -1): Balances {
  const next = { ...balances }
  for (const [uid, amount] of Object.entries(effect)) next[uid] = (next[uid] ?? 0) + sign * amount
  return next
}

/**
 * Balances after replacing `before` with `after`. Pass null for a new expense (before) or a
 * deleted one (after). Only the difference is applied, so other expenses are untouched.
 */
export function rebalance(
  balances: Balances,
  before: ExpenseMoney | null,
  after: ExpenseMoney | null,
): Balances {
  let next = balances
  if (before) next = applyEffect(next, expenseEffect(before), -1)
  if (after) next = applyEffect(next, expenseEffect(after), 1)
  return next
}

export function total(balances: Balances): number {
  return Object.values(balances).reduce((a, b) => a + b, 0)
}

/** Everyone an expense touches: the payer and the people in the split. */
export function peopleIn(e: ExpenseMoney): string[] {
  return [...new Set([e.paidBy, ...Object.keys(e.splits)])]
}
