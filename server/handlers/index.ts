import type { Handler } from '../lib/request.js'
import { spendingByMonth } from './spendingByMonth.js'
import { deleteExpense, saveExpense } from './expenses.js'
import { createGroup } from './createGroup.js'
import { updateGroup } from './updateGroup.js'
import { acceptInvite, createInvite, invitePreview } from './invites.js'
import { leaveGroup, removeMember } from './members.js'
import { recomputeBalances, recordPayment, settleUp } from './payments.js'
import { updateProfile } from './updateProfile.js'

/** Every API endpoint: POST /api/<name>. These were the callable Cloud Functions. */
export const handlers: Record<string, Handler | undefined> = {
  acceptInvite,
  createGroup,
  createInvite,
  deleteExpense,
  invitePreview,
  leaveGroup,
  recomputeBalances,
  recordPayment,
  removeMember,
  saveExpense,
  settleUp,
  spendingByMonth,
  updateGroup,
  updateProfile,
}
