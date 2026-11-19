// Input schemas shared by the Cloud Functions (which enforce them) and the client forms (which
// use them to show the same errors before calling). They live under functions/ because only that
// folder is uploaded when functions deploy; the client imports them from here.
// Keep this file free of Node or browser APIs.
import { z } from 'zod'
import { CURRENCY_CODES, MAX_AMOUNT_MINOR } from '../lib/money.js'

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

// ---------- expenses ----------

/** A Firestore auto-id: the client makes one up front so a receipt can be uploaded before saving. */
export const expenseId = z
  .string()
  .regex(/^[A-Za-z0-9]{20}$/, 'That expense id is not one SplitIt made.')

export const expenseTitle = z
  .string()
  .trim()
  .min(1, 'Give it a short title, like “Dinner at Yellow Chilli”.')
  .max(80, 'Use 80 characters or fewer.')
  .regex(/^[^\p{Cc}]*$/u, 'Remove line breaks and control characters.')

/** Integer minor units, above zero, within MAX_AMOUNT_MINOR. Never a float. */
export const amountMinor = z
  .number({ message: 'Enter an amount.' })
  .int('Amounts are whole numbers of kobo, cents or yen.')
  .positive('Enter an amount above zero.')
  .max(MAX_AMOUNT_MINOR, 'That amount is too large for one expense.')

export const saveExpenseInput = z
  .strictObject({
    groupId: id,
    /** New id for a new expense, or the id of the expense being edited. */
    expenseId,
    title: expenseTitle,
    amountMinor,
    paidBy: id,
    /** uid -> share in minor units. Everyone listed owes a share above zero. */
    splits: z.record(id, amountMinor),
    /** receipts/{groupId}/{expenseId}/{file}, or null for no receipt. */
    receiptPath: z.string().max(300).nullable(),
  })
  .superRefine((d, ctx) => {
    const people = Object.keys(d.splits).length
    if (people === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits'],
        message: 'Tick at least one person to split with.',
      })
      return
    }
    if (people > MAX_MEMBERS) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits'],
        message: `A split can include at most ${MAX_MEMBERS} people.`,
      })
      return
    }
    const sum = Object.values(d.splits).reduce((a, b) => a + b, 0)
    if (sum !== d.amountMinor) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits'],
        message:
          sum < d.amountMinor
            ? 'Some of the amount is still unassigned. Custom amounts must add up to the total.'
            : 'Custom amounts are over the total. They must add up to it exactly.',
      })
    }
  })

export const deleteExpenseInput = z.strictObject({ groupId: id, expenseId })

// ---------- payments ----------

export const recordPaymentInput = z
  .strictObject({
    groupId: id,
    /** Who paid. */
    from: id,
    /** Who received it. */
    to: id,
    amountMinor,
  })
  .refine((d) => d.from !== d.to, { message: 'Someone cannot pay themselves.', path: ['to'] })

// ---------- dashboard ----------

export const spendingByMonthInput = z.strictObject({
  /** The viewer's time zone, so months start at their midnight (e.g. "Africa/Lagos"). */
  timeZone: z.string().min(1).max(64),
  months: z.number().int().min(1).max(12).default(6),
})

export interface SpendingByMonthResult {
  /** "2026-06" … "2026-11", oldest first. */
  months: string[]
  /** One row per currency of my groups: my share per month, in that currency's minor units. */
  byCurrency: Record<string, number[]>
}

// ---------- inputs as the client sends them ----------

export type CreateGroupInput = z.input<typeof createGroupInput>
export type UpdateGroupInput = z.input<typeof updateGroupInput>
export type CreateInviteInput = z.input<typeof createInviteInput>
export type SaveExpenseInput = z.input<typeof saveExpenseInput>
export type RecordPaymentInput = z.input<typeof recordPaymentInput>

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
export interface SaveExpenseResult {
  expenseId: string
  created: boolean
}
/** One payment in a settle-up plan. */
export interface Transfer {
  from: string
  to: string
  amountMinor: number
}
export interface SettleUpResult {
  currency: string
  /** Current members' balances the plan was worked out from. */
  balances: Record<string, number>
  transfers: Transfer[]
}
export interface RecordPaymentResult {
  paymentId: string
}
export interface RecomputeBalancesResult {
  balances: Record<string, number>
  /** True when the stored balances differed and were corrected. */
  changed: boolean
  expenses: number
  payments: number
}
export interface LeaveGroupResult {
  /** True when you were the last member and the group was deleted. */
  groupDeleted: boolean
}
