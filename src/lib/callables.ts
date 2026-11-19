import { httpsCallable } from 'firebase/functions'
import type {
  AcceptInviteResult,
  CreateGroupInput,
  CreateGroupResult,
  CreateInviteInput,
  CreateInviteResult,
  InvitePreviewResult,
  LeaveGroupResult,
  RecomputeBalancesResult,
  RecordPaymentInput,
  RecordPaymentResult,
  SaveExpenseInput,
  SaveExpenseResult,
  SettleUpResult,
  SpendingByMonthResult,
  UpdateGroupInput,
} from '../../functions/src/shared/schemas'
import { functions } from './firebase'

// Typed wrappers around the callable Cloud Functions. Input and result types come from the same
// zod schemas the functions validate with (functions/src/shared/schemas.ts).

/** Each callable's [input, result]. */
interface Callables {
  createGroup: [CreateGroupInput, CreateGroupResult]
  updateGroup: [UpdateGroupInput, { ok: true }]
  createInvite: [CreateInviteInput, CreateInviteResult]
  invitePreview: [{ token: string }, InvitePreviewResult]
  acceptInvite: [{ token: string }, AcceptInviteResult]
  leaveGroup: [{ groupId: string }, LeaveGroupResult]
  removeMember: [{ groupId: string; uid: string }, { ok: true }]
  saveExpense: [SaveExpenseInput, SaveExpenseResult]
  deleteExpense: [{ groupId: string; expenseId: string }, { ok: true }]
  settleUp: [{ groupId: string }, SettleUpResult]
  recordPayment: [RecordPaymentInput, RecordPaymentResult]
  recomputeBalances: [{ groupId: string }, RecomputeBalancesResult]
  spendingByMonth: [{ timeZone: string; months?: number }, SpendingByMonthResult]
  updateProfile: [{ displayName?: string; photoPath?: string | null }, { groupsUpdated: number }]
}

function callable<K extends keyof Callables>(name: K) {
  const fn = httpsCallable<Callables[K][0], Callables[K][1]>(functions, name)
  return async (data: Callables[K][0]): Promise<Callables[K][1]> => (await fn(data)).data
}

export const createGroup = callable('createGroup')
export const updateGroup = callable('updateGroup')
export const createInvite = callable('createInvite')
export const invitePreview = callable('invitePreview')
export const acceptInvite = callable('acceptInvite')
export const leaveGroup = callable('leaveGroup')
export const removeMember = callable('removeMember')
export const saveExpense = callable('saveExpense')
export const deleteExpense = callable('deleteExpense')
export const settleUp = callable('settleUp')
export const recordPayment = callable('recordPayment')
export const recomputeBalances = callable('recomputeBalances')
export const spendingByMonth = callable('spendingByMonth')
export const updateProfile = callable('updateProfile')

/**
 * The message to show for a failed call. Our functions already write plain sentences
 * ("This invite has expired. Ask for a new one."); anything else gets a generic retry line.
 */
export function callableErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const code = String(error.code)
    if (code === 'functions/internal' || code === 'functions/unavailable') {
      return "Couldn't reach the server. Check your connection and try again."
    }
    if (code.startsWith('functions/') && typeof error.message === 'string' && error.message) {
      return error.message
    }
  }
  return 'Something went wrong. Try again.'
}
