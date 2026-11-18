// Input schemas shared by the Cloud Functions (which enforce them) and the client forms (which
// use them to show the same errors before calling). They live under functions/ because only that
// folder is uploaded when functions deploy; the client imports them from here.
// Keep this file free of Node or browser APIs.
import { z } from 'zod'
import { CURRENCY_CODES } from '../lib/money.js'

export const COVERS = ['beach', 'flat', 'dinner', 'trip', 'plain'] as const
export type CoverName = (typeof COVERS)[number]

/** Most members one group may have. Keeps memberIds and balances small and every read cheap. */
export const MAX_MEMBERS = 50
/** How long an invite works. Link invites can be reused until then. */
export const INVITE_DAYS = 7

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'That id has unexpected characters.')

export const groupName = z
  .string()
  .trim()
  .min(1, 'Give the group a name so people know what it is for.')
  .max(60, 'Use 60 characters or fewer.')
  .regex(/^[^\p{Cc}]*$/u, 'Remove line breaks and control characters.')

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  // Domain labels can't contain dots, so the pattern runs in linear time (no backtracking).
  .regex(
    /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/,
    'Enter a full email address, like friend@example.com.',
  )

export const createGroupInput = z.strictObject({
  name: groupName,
  currency: z.enum(CURRENCY_CODES as [string, ...string[]], {
    message: 'Choose a currency from the list.',
  }),
  cover: z.enum(COVERS),
})

export const updateGroupInput = z
  .strictObject({
    groupId: id,
    name: groupName.optional(),
    cover: z.enum(COVERS).optional(),
    /** An uploaded photo under covers/{groupId}/, or null to go back to the illustration. */
    coverPath: z.string().max(300).nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.cover !== undefined || d.coverPath !== undefined, {
    message: 'Send a name, cover or coverPath to change.',
  })

/** Without email: the group's shareable link. With email: a personal invite for that address. */
export const createInviteInput = z.strictObject({
  groupId: id,
  email: email.nullable().optional(),
})

export const inviteTokenInput = z.strictObject({ token: id })
export const groupIdInput = z.strictObject({ groupId: id })
export const removeMemberInput = z.strictObject({ groupId: id, uid: id })

// ---------- inputs as the client sends them ----------

export type CreateGroupInput = z.input<typeof createGroupInput>
export type UpdateGroupInput = z.input<typeof updateGroupInput>
export type CreateInviteInput = z.input<typeof createInviteInput>

// ---------- results ----------

export interface CreateGroupResult {
  groupId: string
}
export interface CreateInviteResult {
  token: string
  /** ISO time the invite stops working. */
  expiresAt: string
  /** True when an existing invite was returned instead of a new one. */
  reused: boolean
}
export type InviteStatus = 'valid' | 'expired' | 'used' | 'already-member' | 'wrong-email' | 'full'
export interface InvitePreviewResult {
  status: InviteStatus
  groupName: string
  inviterName: string
  /** Only for already-member, so the join screen can link straight to the group. */
  groupId: string | null
}
export interface AcceptInviteResult {
  groupId: string
  alreadyMember: boolean
}
export interface LeaveGroupResult {
  /** True when you were the last member and the group was deleted. */
  groupDeleted: boolean
}
