import type { Timestamp } from 'firebase/firestore'

/** groups/{gid}/expenses/{eid}, with the id added. Written only by saveExpense/deleteExpense. */
export interface Expense {
  id: string
  title: string
  /** Integer minor units (kobo, cents, yen). */
  amountMinor: number
  paidBy: string
  createdBy: string
  /** uid -> share in minor units; adds up exactly to amountMinor. */
  splits: Record<string, number>
  splitUserIds: string[]
  receiptPath: string | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

/** What an expense does to my balance: + I'm owed, − I owe. */
export function myEffect(
  e: Pick<Expense, 'amountMinor' | 'paidBy' | 'splits'>,
  me: string,
): number {
  return (e.paidBy === me ? e.amountMinor : 0) - (e.splits[me] ?? 0)
}

/** Everyone the expense mentions: the payer and the people in the split. */
export function peopleInExpense(e: Pick<Expense, 'paidBy' | 'splits'>): string[] {
  return [...new Set([e.paidBy, ...Object.keys(e.splits)])]
}
