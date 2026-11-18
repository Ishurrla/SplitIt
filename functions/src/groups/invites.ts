import { randomBytes } from 'node:crypto'
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type Transaction,
} from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { parseInput, requireAuth } from '../lib/callable.js'
import {
  addActivity,
  groupRef,
  memberProfile,
  memberRef,
  readMembership,
  type GroupDoc,
  type MemberDoc,
} from '../lib/groups.js'
import { callableOptions } from '../lib/options.js'
import {
  INVITE_DAYS,
  MAX_MEMBERS,
  createInviteInput,
  inviteTokenInput,
  type AcceptInviteResult,
  type CreateInviteResult,
  type InvitePreviewResult,
  type InviteStatus,
} from '../shared/schemas.js'

/** invites/{token}. The document id is the secret: 128 random bits. */
interface InviteDoc {
  groupId: string
  /** null: a link anyone can use until it expires. Otherwise only that (lower-case) address. */
  email: string | null
  invitedBy: string
  /** Set when an email invite is used; email invites work once. */
  acceptedAt: Timestamp | null
  expiresAt: Timestamp
  createdAt: FieldValue | Timestamp
}

const DAY_MS = 86_400_000
const inviteRef = (token: string) => getFirestore().doc(`invites/${token}`)
const newToken = () => randomBytes(16).toString('base64url')

const linkNotWorking = () =>
  new HttpsError(
    'not-found',
    "This invite link doesn't work. Check you copied all of it, or ask for a new one.",
  )

/** a•••@example.com: enough to recognise, not enough to harvest. */
export function maskEmail(address: string): string {
  const [local = '', domain = ''] = address.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}

function callerEmail(token: { email?: unknown } | undefined): string | null {
  return typeof token?.email === 'string' ? token.email.toLowerCase() : null
}

/**
 * Why this caller can't use this invite, or 'valid'. Order matters: already being a member wins,
 * so opening an old link for your own group just takes you there.
 */
function inviteStatus(
  invite: InviteDoc,
  group: GroupDoc,
  uid: string,
  email: string | null,
): InviteStatus {
  if (group.memberIds.includes(uid)) return 'already-member'
  if (invite.email !== null && invite.acceptedAt !== null) return 'used'
  if (invite.expiresAt.toMillis() <= Date.now()) return 'expired'
  if (invite.email !== null && invite.email !== email) return 'wrong-email'
  if (group.memberIds.length >= MAX_MEMBERS) return 'full'
  return 'valid'
}

async function readInviteAndGroup(tx: Transaction, token: string) {
  const inviteSnap = await tx.get(inviteRef(token))
  if (!inviteSnap.exists) throw linkNotWorking()
  const invite = inviteSnap.data() as InviteDoc
  const groupSnap = await tx.get(groupRef(invite.groupId))
  if (!groupSnap.exists) throw linkNotWorking() // the group was deleted
  return { invite, group: groupSnap.data() as GroupDoc }
}

/**
 * Any member may invite. Without an email: returns the group's current link (reused while it has
 * more than a day left, so the link people already have keeps working). With an email: a personal
 * invite for that address; asking again for the same address returns the same invite.
 * No email is sent yet: the inviter shares the link themselves (sending is a Phase 9 decision).
 */
export const createInvite = onCall<unknown, Promise<CreateInviteResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { groupId, email = null } = parseInput(createInviteInput, request.data)
    const db = getFirestore()

    return db.runTransaction(async (tx) => {
      const { group } = await readMembership(tx, groupId, uid)
      const existing = await tx.get(db.collection('invites').where('groupId', '==', groupId))
      const now = Date.now()

      if (email !== null) {
        const sameEmailUsers = await tx.get(
          db.collection('users').where('email', '==', email).limit(5),
        )
        if (sameEmailUsers.docs.some((u) => group.memberIds.includes(u.id))) {
          throw new HttpsError('already-exists', 'That person is already in this group.')
        }
      }

      const reusable = existing.docs
        .map((d) => ({ token: d.id, ...(d.data() as InviteDoc) }))
        .filter((i) =>
          email === null
            ? i.email === null && i.expiresAt.toMillis() > now + DAY_MS
            : i.email === email && i.acceptedAt === null && i.expiresAt.toMillis() > now,
        )
        .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis())[0]
      if (reusable) {
        return {
          token: reusable.token,
          expiresAt: reusable.expiresAt.toDate().toISOString(),
          reused: true,
        }
      }

      const token = newToken()
      const expiresAt = Timestamp.fromMillis(now + INVITE_DAYS * DAY_MS)
      const invite: InviteDoc = {
        groupId,
        email,
        invitedBy: uid,
        acceptedAt: null,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      }
      tx.create(inviteRef(token), invite)
      if (email !== null) addActivity(tx, groupId, uid, 'invite.created', { email })
      return { token, expiresAt: expiresAt.toDate().toISOString(), reused: false }
    })
  },
)

/**
 * What the join screen may show before you join: the group's name, who invited you, and whether
 * the invite works for you. Nothing else about the group (no members, amounts or ids, except the
 * id when you are already a member).
 */
export const invitePreview = onCall<unknown, Promise<InvitePreviewResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { token } = parseInput(inviteTokenInput, request.data)

    return getFirestore().runTransaction(async (tx) => {
      const { invite, group } = await readInviteAndGroup(tx, token)
      const inviterSnap = await tx.get(memberRef(invite.groupId, invite.invitedBy))
      const inviterName =
        (inviterSnap.data() as MemberDoc | undefined)?.displayName ??
        group.pastMembers[invite.invitedBy]?.displayName ??
        'A member'
      const status = inviteStatus(invite, group, uid, callerEmail(request.auth?.token))
      return {
        status,
        groupName: group.name,
        inviterName,
        groupId: status === 'already-member' ? invite.groupId : null,
      }
    })
  },
)

/** Joins the group named by the invite, after checking the invite still works for this person. */
export const acceptInvite = onCall<unknown, Promise<AcceptInviteResult>>(
  callableOptions,
  async (request) => {
    const uid = requireAuth(request)
    const { token } = parseInput(inviteTokenInput, request.data)

    return getFirestore().runTransaction(async (tx) => {
      const { invite, group } = await readInviteAndGroup(tx, token)
      const status = inviteStatus(invite, group, uid, callerEmail(request.auth?.token))
      const profile = await memberProfile(tx, uid) // all reads before any write

      switch (status) {
        case 'already-member':
          return { groupId: invite.groupId, alreadyMember: true }
        case 'used':
          throw new HttpsError(
            'failed-precondition',
            'This invite has already been used. Ask for a new one.',
          )
        case 'expired':
          throw new HttpsError('failed-precondition', 'This invite has expired. Ask for a new one.')
        case 'wrong-email':
          throw new HttpsError(
            'permission-denied',
            `This invite is for ${maskEmail(invite.email ?? '')}. Sign in with that address to join.`,
          )
        case 'full':
          throw new HttpsError(
            'resource-exhausted',
            `This group already has ${MAX_MEMBERS} members, the most allowed.`,
          )
        case 'valid':
          break
      }

      const member: MemberDoc = {
        role: 'member',
        ...profile,
        joinedAt: FieldValue.serverTimestamp(),
      }
      tx.create(memberRef(invite.groupId, uid), member)
      tx.update(
        groupRef(invite.groupId),
        'memberIds',
        FieldValue.arrayUnion(uid),
        new FieldPath('balances', uid),
        0,
        new FieldPath('pastMembers', uid),
        FieldValue.delete(), // someone who left and comes back is a member again
      )
      if (invite.email !== null)
        tx.update(inviteRef(token), { acceptedAt: FieldValue.serverTimestamp() })
      addActivity(tx, invite.groupId, uid, 'member.joined', { name: profile.displayName })
      return { groupId: invite.groupId, alreadyMember: false }
    })
  },
)
