import type { Timestamp } from 'firebase/firestore'

/** groups/{gid}/activity/{aid}, written by the functions in the same transaction as the change. */
export interface ActivityEntry {
  id: string
  actorId: string
  kind: string
  payload: Record<string, string | number | null>
  createdAt: Timestamp | null
}

export type ActivityFilter = 'all' | 'expenses' | 'payments' | 'groups'

/** Which filter tab an entry belongs to. */
export function activityCategory(kind: string): Exclude<ActivityFilter, 'all'> {
  if (kind.startsWith('expense.')) return 'expenses'
  if (kind.startsWith('payment.')) return 'payments'
  return 'groups'
}
