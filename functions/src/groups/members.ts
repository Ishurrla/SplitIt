import { FieldPath, FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
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
import { groupIdInput, removeMemberInput, type LeaveGroupResult } from '../shared/schemas.js'

/**
 * Takes someone out of a group: deletes their member document (which ends their read access,
 * see isMember() in the rules), drops them from memberIds and balances, and keeps their name in
 * pastMembers so old expenses can still say who paid. Only call with a zero balance.
 */
function detachMember(tx: Transaction, gid: string, uid: string, displayName: string) {
  tx.delete(memberRef(gid, uid))
  tx.update(
    groupRef(gid),
    'memberIds',
    FieldValue.arrayRemove(uid),
    new FieldPath('balances', uid),
    FieldValue.delete(),
    new FieldPath('pastMembers', uid),
    { displayName },
  )
}

function balanceOf(group: GroupDoc, uid: string): number {
  return group.balances[uid] ?? 0
}

/** Deletes a group nobody is in any more: its documents, its invites and its files. */
async function deleteGroupData(gid: string) {
  const db = getFirestore()
  await db.recursiveDelete(groupRef(gid))
  const invites = await db.collection('invites').where('groupId', '==', gid).get()
  await Promise.all(invites.docs.map((d) => d.ref.delete()))
  const bucket = getStorage().bucket()
  await Promise.all(
    [`covers/${gid}/`, `receipts/${gid}/`].map((prefix) =>
      bucket.deleteFiles({ prefix }).catch((error: unknown) => {
        logger.warn('Could not delete group files', { prefix, error })
      }),
    ),
  )
}

/**
 * Leave a group. Your balance must be zero first. If you are the owner, the longest-standing other
 * member becomes owner. If you are the last member, the group is deleted.
 */
export const leaveGroup = onCall<unknown, Promise<LeaveGroupResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { groupId } = parseInput(groupIdInput, request.data)
    const db = getFirestore()

    const groupDeleted = await db.runTransaction(async (tx) => {
      const { group, role } = await readMembership(tx, groupId, uid)
      if (balanceOf(group, uid) !== 0) {
        throw new HttpsError(
          'failed-precondition',
          'You still owe or are owed money in this group. Settle up first, then leave.',
        )
      }
      const me = (await tx.get(memberRef(groupId, uid))).data() as MemberDoc
      const others = (
        await tx.get(db.collection(`groups/${groupId}/members`).orderBy('joinedAt').limit(2))
      ).docs.filter((d) => d.id !== uid)

      if (group.memberIds.length <= 1 || others.length === 0) {
        tx.delete(memberRef(groupId, uid))
        tx.delete(groupRef(groupId))
        return true
      }
      if (role === 'owner') {
        const heir = others[0]
        if (heir) tx.update(heir.ref, { role: 'owner' })
      }
      detachMember(tx, groupId, uid, me.displayName)
      addActivity(tx, groupId, uid, 'member.left', { name: me.displayName })
      return false
    })

    if (groupDeleted) await deleteGroupData(groupId)
    return { groupDeleted }
  },
)

/** Owner only: remove another member whose balance is zero. */
export const removeMember = onCall<unknown, Promise<{ ok: true }>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { groupId, uid: target } = parseInput(removeMemberInput, request.data)
    if (target === uid) {
      throw new HttpsError('invalid-argument', 'To take yourself out, use Leave group.')
    }

    await getFirestore().runTransaction(async (tx) => {
      const { group } = await readMembership(tx, groupId, uid, 'owner')
      const targetSnap = await tx.get(memberRef(groupId, target))
      if (!targetSnap.exists) throw new HttpsError('not-found', "That person isn't in this group.")
      const targetMember = targetSnap.data() as MemberDoc
      if (balanceOf(group, target) !== 0) {
        throw new HttpsError(
          'failed-precondition',
          `${targetMember.displayName} still owes or is owed money here. Settle up first.`,
        )
      }
      detachMember(tx, groupId, target, targetMember.displayName)
      addActivity(tx, groupId, uid, 'member.removed', { name: targetMember.displayName })
    })
    return { ok: true }
  },
)
