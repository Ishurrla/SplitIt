import { initializeApp } from 'firebase-admin/app'

// Region and limits are set on each function through lib/options.ts (see the note there).
initializeApp()

export { deleteExpense, saveExpense } from './expenses/expenses.js'
export { createGroup } from './groups/createGroup.js'
export { updateGroup } from './groups/updateGroup.js'
export { acceptInvite, createInvite, invitePreview } from './groups/invites.js'
export { leaveGroup, removeMember } from './groups/members.js'
export { updateProfile } from './profile/updateProfile.js'
