import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { ApiError } from '../lib/errors.js'
import { defineHandler, parseInput, requireAuth } from '../lib/request.js'
import type { GroupDoc } from '../lib/groups.js'
import { bucketSpending, isTimeZone, lastMonths, type ShareSource } from '../lib/spending.js'
import { spendingByMonthInput, type SpendingByMonthResult } from '../shared/schemas.js'

const DAY_MS = 86_400_000

/**
 * My share of spending per month, per currency, from the real expenses of the groups I'm in.
 * Only expenses with me in the split are read (splitUserIds array-contains me), and only my
 * share counts. Edits and deletes show up automatically: this reads what is there now.
 * Needs the (splitUserIds, createdAt) index in firestore.indexes.json once deployed.
 */
export const spendingByMonth = defineHandler<SpendingByMonthResult>(async (request) => {
  const uid = requireAuth(request)
  const { timeZone, months: count } = parseInput(spendingByMonthInput, request.data)
  if (!isTimeZone(timeZone))
    throw new ApiError('invalid-argument', 'timeZone: That time zone is not one I know.')

  const now = new Date()
  const months = lastMonths(now, timeZone, count)
  // A day or two either side of the window doesn't matter: bucketing by month key trims it.
  const since = Timestamp.fromMillis(now.getTime() - (count + 1) * 31 * DAY_MS)

  const db = getFirestore()
  const groups = await db.collection('groups').where('memberIds', 'array-contains', uid).get()
  const currencies = [...new Set<string>(groups.docs.map((g) => (g.data() as GroupDoc).currency))]

  const perGroup = await Promise.all(
    groups.docs.map(async (g) => {
      const currency = (g.data() as GroupDoc).currency
      const snap = await g.ref
        .collection('expenses')
        .where('splitUserIds', 'array-contains', uid)
        .where('createdAt', '>=', since)
        .get()
      return snap.docs.map((d): ShareSource => {
        const e = d.data() as { splits: Record<string, number>; createdAt: Timestamp }
        return { currency, splits: e.splits, createdAt: e.createdAt.toDate() }
      })
    }),
  )

  return {
    months,
    byCurrency: bucketSpending(perGroup.flat(), uid, months, timeZone, currencies),
  }
})
