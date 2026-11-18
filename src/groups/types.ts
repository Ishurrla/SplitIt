import type { Timestamp } from 'firebase/firestore'
import type { CurrencyCode } from '../lib/money'

export type CoverName = 'beach' | 'flat' | 'dinner' | 'trip' | 'plain'

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
  createdAt: Timestamp | null
}
