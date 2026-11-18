import type { Timestamp } from 'firebase/firestore'
import type { CoverName } from '../../functions/src/shared/schemas'
import type { CurrencyCode } from '../lib/money'

export type { CoverName }

/** groups/{gid}. Written only by Cloud Functions; members read it. */
export interface Group {
  id: string
  name: string
  cover: CoverName
  coverPath: string | null
  currency: CurrencyCode
  createdBy: string
  memberIds: string[]
  /** uid -> net amount in minor units (positive: is owed; negative: owes). Sums to 0. */
  balances: Record<string, number>
  /** People who left or were removed, so old expenses can still show who paid. */
  pastMembers: Record<string, { displayName: string }>
  /** Missing on groups made before Phase 4 (treated as 0). */
  expenseCount?: number
  createdAt: Timestamp | null
}

/** groups/{gid}/members/{uid}, with the uid added. */
export interface Member {
  uid: string
  role: 'owner' | 'member'
  displayName: string
  photoPath: string | null
  photoURL: string | null
  joinedAt: Timestamp | null
}
