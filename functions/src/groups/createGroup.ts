import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import {
  addActivity,
  groupRef,
  memberProfile,
  memberRef,
  type GroupDoc,
  type MemberDoc,
} from '../lib/groups.js'
import { parseInput, requireAuth } from '../lib/callable.js'
import { callableOptions } from '../lib/options.js'
import { createGroupInput, type CreateGroupResult } from '../shared/schemas.js'

/** Creates a group with the caller as its owner and only member. */
export const createGroup = onCall<unknown, Promise<CreateGroupResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const input = parseInput(createGroupInput, request.data)
    const gid = getFirestore().collection('groups').doc().id

    await getFirestore().runTransaction(async (tx) => {
      const profile = await memberProfile(tx, uid)
      const group: GroupDoc = {
        name: input.name,
        cover: input.cover,
        coverPath: null,
        currency: input.currency,
        createdBy: uid,
        memberIds: [uid],
        balances: { [uid]: 0 },
        pastMembers: {},
        expenseCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      }
      const member: MemberDoc = {
        role: 'owner',
        ...profile,
        joinedAt: FieldValue.serverTimestamp(),
      }
      tx.create(groupRef(gid), group)
      tx.create(memberRef(gid, uid), member)
      addActivity(tx, gid, uid, 'group.created', { name: input.name })
    })

    return { groupId: gid }
  },
)
