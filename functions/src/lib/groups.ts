import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

/** groups/{gid} as stored. Written only here, in the functions. */
export interface GroupDoc {
  name: string
  cover: string
  coverPath: string | null
  currency: string
  createdBy: string
  memberIds: string[]
  balances: Record<string, number>
  /** Names of people who left or were removed, so old expenses can still say who paid. */
  pastMembers: Record<string, { displayName: string }>
  /** How many expenses the group has; kept by saveExpense and deleteExpense. */
  expenseCount: number
  createdAt: FieldValue
}

export interface MemberDoc {
  role: 'owner' | 'member'
  displayName: string
  photoPath: string | null
  photoURL: string | null
  joinedAt: FieldValue
}

export type ActivityKind =
  | 'group.created'
  | 'group.updated'
  | 'member.joined'
  | 'member.left'
  | 'member.removed'
  | 'invite.created'
  | 'expense.added'
  | 'expense.edited'
  | 'expense.deleted'

export const groupRef = (gid: string) => getFirestore().doc(`groups/${gid}`)
export const memberRef = (gid: string, uid: string) =>
  getFirestore().doc(`groups/${gid}/members/${uid}`)

/**
 * The same answer for "no such group" and "not a member", so a caller can't probe group ids.
 * Mirrors the rules, which answer permission-denied in both cases.
 */
export const notAMember = () =>
  new HttpsError('permission-denied', "You're not in this group. Ask a member to invite you.")

/**
 * Reads the group and the caller's member document inside a transaction.
 * Throws permission-denied unless the caller is a member (and the owner, when required).
 */
export async function readMembership(
  tx: Transaction,
  gid: string,
  uid: string,
  need: 'member' | 'owner' = 'member',
): Promise<{ group: GroupDoc; groupSnap: DocumentSnapshot; role: MemberDoc['role'] }> {
  const [groupSnap, memberSnap] = await Promise.all([
    tx.get(groupRef(gid)),
    tx.get(memberRef(gid, uid)),
  ])
  if (!groupSnap.exists || !memberSnap.exists) throw notAMember()
  const role = (memberSnap.data() as MemberDoc).role
  if (need === 'owner' && role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only the group owner can do this.')
  }
  return { group: groupSnap.data() as GroupDoc, groupSnap, role }
}

/** The name and photo copied onto members/{uid} (see updateProfile). */
export async function memberProfile(
  tx: Transaction,
  uid: string,
): Promise<Pick<MemberDoc, 'displayName' | 'photoPath' | 'photoURL'>> {
  const snap = await tx.get(getFirestore().doc(`users/${uid}`))
  if (!snap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'Your profile has not been set up yet. Sign out, sign in again, then retry.',
    )
  }
  const u = snap.data() as {
    displayName: string
    photoPath: string | null
    photoURL: string | null
  }
  return { displayName: u.displayName, photoPath: u.photoPath, photoURL: u.photoURL }
}

/** Adds a timeline entry in the same transaction as the change it describes. */
export function addActivity(
  tx: Transaction,
  gid: string,
  actorId: string,
  kind: ActivityKind,
  payload: Record<string, string | number | null> = {},
): DocumentReference {
  const ref = getFirestore().collection(`groups/${gid}/activity`).doc()
  tx.create(ref, { actorId, kind, payload, createdAt: FieldValue.serverTimestamp() })
  return ref
}
