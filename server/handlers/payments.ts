import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore'
import { logger } from '../lib/log.js'
import {
  paymentEffect,
  rebuild,
  applyEffect,
  total,
  type ExpenseMoney,
  type PaymentMoney,
} from '../lib/balances.js'
import { ApiError } from '../lib/errors.js'
import { defineHandler, parseInput, requireAuth } from '../lib/request.js'
import { addActivity, groupRef, memberRef, readMembership, type MemberDoc } from '../lib/groups.js'
import { formatMinor, isCurrencyCode } from '../lib/money.js'
import { settle } from '../lib/settle.js'
import {
  groupIdInput,
  recordPaymentInput,
  type RecomputeBalancesResult,
  type RecordPaymentResult,
  type SettleUpResult,
} from '../shared/schemas.js'

/** groups/{gid}/payments/{pid}. Created only by recordPayment and never edited or deleted. */
interface PaymentDoc extends PaymentMoney {
  createdBy: string
  createdAt: FieldValue
}

function money(amount: number, currency: string): string {
  return isCurrencyCode(currency) ? formatMinor(amount, currency) : `${amount} ${currency}`
}

async function nameOf(tx: Transaction, gid: string, uid: string): Promise<string> {
  const snap = await tx.get(memberRef(gid, uid))
  return (snap.data() as MemberDoc | undefined)?.displayName ?? 'someone'
}

/**
 * The fewest payments (greedy largest creditor / largest debtor) that clear the group's balances.
 * Worked out here so the browser only displays it. Members only; anyone else gets permission-denied.
 * Only current members have balances (people leave at zero), so nobody who left can appear.
 */
export const settleUp = defineHandler<SettleUpResult>(async (request) => {
  const uid = requireAuth(request)
  const { groupId } = parseInput(groupIdInput, request.data)
  return getFirestore().runTransaction(async (tx) => {
    const { group } = await readMembership(tx, groupId, uid)
    const balances = Object.fromEntries(group.memberIds.map((m) => [m, group.balances[m] ?? 0]))
    return { currency: group.currency, balances, transfers: settle(balances) }
  })
})

/**
 * Records that `from` paid `to`, in full or in part. Only the payer or the receiver can record it,
 * because a payment can never be changed afterwards.
 *
 * Limit: no more than the payer owes and no more than the receiver is owed, as they stand inside
 * this transaction. Balances are pooled per person, so that is what "owes that person" can mean;
 * it can never push either balance past zero. Two payments recorded at the same moment are two
 * transactions on the same group document, so the second one re-reads the balances the first left
 * and is refused if it would overpay.
 */
export const recordPayment = defineHandler<RecordPaymentResult>(async (request) => {
  const uid = requireAuth(request)
  const { groupId, from, to, amountMinor } = parseInput(recordPaymentInput, request.data)
  if (uid !== from && uid !== to) {
    throw new ApiError(
      'permission-denied',
      'Only the person who paid or the person who was paid can record a payment.',
    )
  }

  const db = getFirestore()
  const paymentRef = groupRef(groupId).collection('payments').doc()

  await db.runTransaction(async (tx) => {
    const { group } = await readMembership(tx, groupId, uid)
    if (!group.memberIds.includes(from) || !group.memberIds.includes(to)) {
      throw new ApiError(
        'invalid-argument',
        "Both people must be in the group. Someone in this payment isn't.",
      )
    }
    const owes = Math.max(0, -(group.balances[from] ?? 0))
    const owed = Math.max(0, group.balances[to] ?? 0)
    const limit = Math.min(owes, owed)
    if (amountMinor > limit) {
      const [fromName, toName] = await Promise.all([
        nameOf(tx, groupId, from),
        nameOf(tx, groupId, to),
      ])
      throw new ApiError(
        'failed-precondition',
        limit === 0
          ? `${fromName} doesn't owe ${toName} anything right now, so there's nothing to pay.`
          : `That's more than ${fromName} owes ${toName} right now. The most you can record is ${money(limit, group.currency)}.`,
      )
    }

    const balances = applyEffect(group.balances, paymentEffect({ from, to, amountMinor }), 1)
    if (total(balances) !== 0) {
      logger.error('Balances would not sum to zero', { balances })
      throw new ApiError(
        'internal',
        'Something went wrong working out the balances. Nothing was saved.',
      )
    }
    const payment: PaymentDoc = {
      from,
      to,
      amountMinor,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    }
    tx.create(paymentRef, payment)
    tx.update(groupRef(groupId), { balances })
    addActivity(tx, groupId, uid, 'payment.recorded', {
      from,
      to,
      amountMinor,
      paymentId: paymentRef.id,
    })
  })

  return { paymentId: paymentRef.id }
})

/**
 * Owner only: rebuilds the balances from the raw expenses and payments and saves the result.
 * The incremental updates should already match; this is the check (and the repair if they ever
 * don't). Refuses if someone who left would end up with money owed, since that can't be stored.
 */
export const recomputeBalances = defineHandler<RecomputeBalancesResult>(async (request) => {
  const uid = requireAuth(request)
  const { groupId } = parseInput(groupIdInput, request.data)

  return getFirestore().runTransaction(async (tx) => {
    const { group } = await readMembership(tx, groupId, uid, 'owner')
    const [expenses, payments] = await Promise.all([
      tx.get(groupRef(groupId).collection('expenses')),
      tx.get(groupRef(groupId).collection('payments')),
    ])
    const { balances, strays } = rebuild(
      group.memberIds,
      expenses.docs.map((d) => d.data() as ExpenseMoney),
      payments.docs.map((d) => d.data() as PaymentMoney),
    )
    if (Object.keys(strays).length > 0) {
      logger.error('Rebuilt balances leave money with people who left', { groupId, strays })
      throw new ApiError(
        'failed-precondition',
        "The expenses don't add up for someone who has left, so the balances were not changed.",
      )
    }
    const stored = Object.fromEntries(group.memberIds.map((m) => [m, group.balances[m] ?? 0]))
    const changed = group.memberIds.some((m) => stored[m] !== balances[m])
    if (changed) {
      logger.warn('Stored balances differed from the rebuilt ones; corrected', {
        groupId,
        stored,
        balances,
      })
      tx.update(groupRef(groupId), { balances })
      addActivity(tx, groupId, uid, 'balances.recomputed', {})
    }
    return { balances, changed, expenses: expenses.size, payments: payments.size }
  })
})
