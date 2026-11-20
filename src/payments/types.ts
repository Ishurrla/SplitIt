import type { Timestamp } from 'firebase/firestore'
import type { Transfer } from '../../server/shared/schemas'

export type { Transfer }

/** groups/{gid}/payments/{pid}, with the id added. Created only by recordPayment; never edited. */
export interface Payment {
  id: string
  from: string
  to: string
  amountMinor: number
  createdBy: string
  createdAt: Timestamp | null
}

/** What a payment does to my balance, shown like an expense: paying makes mine go up. */
export function paymentEffect(p: Pick<Payment, 'from' | 'to' | 'amountMinor'>, me: string): number {
  if (p.from === me) return p.amountMinor
  if (p.to === me) return -p.amountMinor
  return 0
}

/** Only the payer or the receiver can record a payment (recordPayment checks the same). */
export function canRecord(t: Pick<Transfer, 'from' | 'to'>, me: string): boolean {
  return t.from === me || t.to === me
}

export const transferKey = (t: Pick<Transfer, 'from' | 'to'>) => `${t.from}->${t.to}`
