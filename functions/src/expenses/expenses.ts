import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { rebalance, peopleIn, total, type ExpenseMoney } from '../lib/balances.js'
import { parseInput, requireAuth } from '../lib/callable.js'
import {
  addActivity,
  groupRef,
  memberRef,
  readMembership,
  type GroupDoc,
  type MemberDoc,
} from '../lib/groups.js'
import { callableOptions } from '../lib/options.js'
import { deleteExpenseInput, saveExpenseInput, type SaveExpenseResult } from '../shared/schemas.js'

/** groups/{gid}/expenses/{eid} as stored. */
interface ExpenseDoc extends ExpenseMoney {
  title: string
  createdBy: string
  /** Keys of splits, so expenses can be queried by person. */
  splitUserIds: string[]
  receiptPath: string | null
  createdAt: FieldValue
  updatedAt: FieldValue
}

const expenseRef = (gid: string, eid: string) => groupRef(gid).collection('expenses').doc(eid)

/** A name for someone in this group or who used to be. */
async function nameOf(tx: Transaction, gid: string, group: GroupDoc, uid: string): Promise<string> {
  const past = group.pastMembers[uid]
  if (past) return past.displayName
  const snap = await tx.get(memberRef(gid, uid))
  return (snap.data() as MemberDoc | undefined)?.displayName ?? 'someone'
}

/**
 * The checks shared by editing and deleting: only the person who added an expense may change it,
 * and not once someone in it has left (their balance is gone, so it could never be settled).
 * All reads; call before any write in the transaction.
 */
async function assertCanChange(
  tx: Transaction,
  gid: string,
  group: GroupDoc,
  old: ExpenseDoc,
  uid: string,
) {
  if (old.createdBy !== uid) {
    const name = await nameOf(tx, gid, group, old.createdBy)
    throw new HttpsError('permission-denied', `Only ${name} can edit or delete this.`)
  }
  const gone = peopleIn(old).find((p) => !group.memberIds.includes(p))
  if (gone) {
    const name = await nameOf(tx, gid, group, gone)
    throw new HttpsError(
      'failed-precondition',
      `${name} has left the group, so this expense can no longer be changed.`,
    )
  }
}

/** A balance change must never create or destroy money. */
function assertBalanced(balances: Record<string, number>) {
  if (total(balances) !== 0) {
    logger.error('Balances would not sum to zero', { balances })
    throw new HttpsError(
      'internal',
      'Something went wrong working out the balances. Nothing was saved.',
    )
  }
}

async function assertReceipt(gid: string, eid: string, path: string) {
  const parts = path.split('/')
  if (
    parts.length !== 4 ||
    parts[0] !== 'receipts' ||
    parts[1] !== gid ||
    parts[2] !== eid ||
    !parts[3]
  ) {
    throw new HttpsError(
      'invalid-argument',
      `receiptPath: Upload the photo to receipts/${gid}/${eid}/ first.`,
    )
  }
  const [exists] = await getStorage().bucket().file(path).exists()
  if (!exists) {
    throw new HttpsError(
      'failed-precondition',
      'The receipt photo has not finished uploading. Add it again, then save.',
    )
  }
}

async function deleteFileQuietly(path: string) {
  await getStorage()
    .bucket()
    .file(path)
    .delete({ ignoreNotFound: true })
    .catch((error: unknown) => {
      logger.warn('Could not delete old receipt', { path, error })
    })
}

/**
 * Adds an expense, or edits one you added. In one transaction: checks you are a member, that the
 * payer and everyone in the split are members, that the splits add up to the amount (the schema),
 * writes the expense, moves the group's balances by exactly the difference, and logs it.
 */
export const saveExpense = onCall<unknown, Promise<SaveExpenseResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const input = parseInput(saveExpenseInput, request.data)
    const { groupId, expenseId } = input
    if (input.receiptPath !== null) await assertReceipt(groupId, expenseId, input.receiptPath)

    const after: ExpenseMoney = {
      amountMinor: input.amountMinor,
      paidBy: input.paidBy,
      splits: input.splits,
    }

    const result = await getFirestore().runTransaction(async (tx) => {
      const { group } = await readMembership(tx, groupId, uid)
      const ref = expenseRef(groupId, expenseId)
      const snap = await tx.get(ref)
      const old = snap.exists ? (snap.data() as ExpenseDoc) : null
      if (old) await assertCanChange(tx, groupId, group, old, uid)

      if (!group.memberIds.includes(input.paidBy)) {
        throw new HttpsError(
          'invalid-argument',
          "The person who paid isn't in this group. Choose someone else.",
        )
      }
      if (Object.keys(input.splits).some((p) => !group.memberIds.includes(p))) {
        throw new HttpsError(
          'invalid-argument',
          "Someone in the split isn't in this group. Untick them and try again.",
        )
      }

      const balances = rebalance(group.balances, old, after)
      assertBalanced(balances)

      const fields = {
        title: input.title,
        amountMinor: input.amountMinor,
        paidBy: input.paidBy,
        splits: input.splits,
        splitUserIds: Object.keys(input.splits),
        receiptPath: input.receiptPath,
        updatedAt: FieldValue.serverTimestamp(),
      }
      const activity = { title: input.title, amountMinor: input.amountMinor, expenseId }
      if (old) {
        tx.update(ref, fields)
        tx.update(groupRef(groupId), { balances })
        addActivity(tx, groupId, uid, 'expense.edited', activity)
      } else {
        const doc: ExpenseDoc = {
          ...fields,
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
        }
        tx.create(ref, doc)
        tx.update(groupRef(groupId), { balances, expenseCount: FieldValue.increment(1) })
        addActivity(tx, groupId, uid, 'expense.added', activity)
      }
      return { created: !old, oldReceipt: old?.receiptPath ?? null }
    })

    if (result.oldReceipt && result.oldReceipt !== input.receiptPath)
      await deleteFileQuietly(result.oldReceipt)
    return { expenseId, created: result.created }
  },
)

/** Deletes an expense you added, taking exactly its effect back out of the balances. */
export const deleteExpense = onCall<unknown, Promise<{ ok: true }>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { groupId, expenseId } = parseInput(deleteExpenseInput, request.data)

    await getFirestore().runTransaction(async (tx) => {
      const { group } = await readMembership(tx, groupId, uid)
      const ref = expenseRef(groupId, expenseId)
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'That expense has already been deleted.')
      const old = snap.data() as ExpenseDoc
      await assertCanChange(tx, groupId, group, old, uid)

      const balances = rebalance(group.balances, old, null)
      assertBalanced(balances)
      tx.delete(ref)
      tx.update(groupRef(groupId), { balances, expenseCount: FieldValue.increment(-1) })
      addActivity(tx, groupId, uid, 'expense.deleted', {
        title: old.title,
        amountMinor: old.amountMinor,
        expenseId,
      })
    })

    await getStorage()
      .bucket()
      .deleteFiles({ prefix: `receipts/${groupId}/${expenseId}/` })
      .catch((error: unknown) => {
        logger.warn('Could not delete receipt files', { groupId, expenseId, error })
      })
    return { ok: true }
  },
)
