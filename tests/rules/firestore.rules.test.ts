import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { A, B, C, EMAIL, G1, G2, createWorld, serverTime } from './world'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createWorld()
})
afterAll(async () => {
  await env.cleanup()
})

const as = (uid: keyof typeof EMAIL) =>
  env.authenticatedContext(uid, { email: EMAIL[uid] }).firestore()
const signedOut = () => env.unauthenticatedContext().firestore()

// Anything a client might try to write into a group. Values look legitimate on purpose:
// the point is that the rules refuse the write itself, whatever the data.
const fakeExpense = {
  title: 'Sneaky',
  amountMinor: 500,
  paidBy: A,
  createdBy: A,
  splits: { [A]: 500 },
  splitUserIds: [A],
  receiptPath: null,
}
const fakePayment = { from: C, to: A, amountMinor: 500, createdBy: A }

describe('signed-out visitor', () => {
  it('cannot read a group', () => assertFails(signedOut().doc(`groups/${G1}`).get()))
  it('cannot query groups', () => assertFails(signedOut().collection('groups').get()))
  it('cannot read members', () => assertFails(signedOut().collection(`groups/${G1}/members`).get()))
  it('cannot read expenses', () =>
    assertFails(signedOut().collection(`groups/${G1}/expenses`).get()))
  it('cannot read payments', () =>
    assertFails(signedOut().collection(`groups/${G1}/payments`).get()))
  it('cannot read activity', () =>
    assertFails(signedOut().collection(`groups/${G1}/activity`).get()))
  it('cannot read an invite', () => assertFails(signedOut().doc('invites/tok1').get()))
  it('cannot read a users document', () => assertFails(signedOut().doc(`users/${A}`).get()))
  it('cannot create a users document', () =>
    assertFails(signedOut().doc('users/anon').set({ displayName: 'Anon' })))
  it('cannot write an expense', () =>
    assertFails(signedOut().doc(`groups/${G1}/expenses/x`).set(fakeExpense)))
})

describe('A (owner) reading their own group', () => {
  it('can read the group', () => assertSucceeds(as(A).doc(`groups/${G1}`).get()))
  it('can list "groups I am in" (memberIds array-contains me)', () =>
    assertSucceeds(as(A).collection('groups').where('memberIds', 'array-contains', A).get()))
  it('can read members', () => assertSucceeds(as(A).collection(`groups/${G1}/members`).get()))
  it('can read one expense', () => assertSucceeds(as(A).doc(`groups/${G1}/expenses/e1`).get()))
  it('can list expenses', () => assertSucceeds(as(A).collection(`groups/${G1}/expenses`).get()))
  it('can list payments', () => assertSucceeds(as(A).collection(`groups/${G1}/payments`).get()))
  it('can list activity, newest first, limited', () =>
    assertSucceeds(
      as(A).collection(`groups/${G1}/activity`).orderBy('createdAt', 'desc').limit(20).get(),
    ))
  it('can list pending invites for the group', () =>
    assertSucceeds(as(A).collection('invites').where('groupId', '==', G1).get()))
  it('can read their own users document', () => assertSucceeds(as(A).doc(`users/${A}`).get()))
})

describe('A (owner) writing directly', () => {
  it('cannot create an expense', () =>
    assertFails(as(A).doc(`groups/${G1}/expenses/x`).set(fakeExpense)))
  it('cannot edit an expense amount', () =>
    assertFails(as(A).doc(`groups/${G1}/expenses/e1`).update({ amountMinor: 1 })))
  it('cannot delete an expense', () => assertFails(as(A).doc(`groups/${G1}/expenses/e1`).delete()))
  it('cannot create a payment', () =>
    assertFails(as(A).doc(`groups/${G1}/payments/x`).set(fakePayment)))
  it('cannot edit a payment', () =>
    assertFails(as(A).doc(`groups/${G1}/payments/p1`).update({ amountMinor: 1 })))
  it('cannot delete a payment', () => assertFails(as(A).doc(`groups/${G1}/payments/p1`).delete()))
  it('cannot change balances on the group', () =>
    assertFails(
      as(A)
        .doc(`groups/${G1}`)
        .update({ [`balances.${A}`]: 0 }),
    ))
  it('cannot rename the group', () =>
    assertFails(as(A).doc(`groups/${G1}`).update({ name: 'Renamed' })))
  it('cannot create a group', () =>
    assertFails(
      as(A)
        .doc('groups/new')
        .set({ name: 'New', memberIds: [A], createdBy: A }),
    ))
  it('cannot delete the group', () => assertFails(as(A).doc(`groups/${G1}`).delete()))
  it('cannot add B as a member', () =>
    assertFails(as(A).doc(`groups/${G1}/members/${B}`).set({ role: 'member' })))
  it('cannot remove C as a member', () =>
    assertFails(as(A).doc(`groups/${G1}/members/${C}`).delete()))
  it("cannot change C's copied displayName on members", () =>
    assertFails(as(A).doc(`groups/${G1}/members/${C}`).update({ displayName: 'Renamed' })))
  it('cannot change their own copied displayName on members (use updateProfile)', () =>
    assertFails(as(A).doc(`groups/${G1}/members/${A}`).update({ displayName: 'Ada L.' })))
  it('cannot write activity', () =>
    assertFails(as(A).doc(`groups/${G1}/activity/x`).set({ actorId: A, kind: 'fake' })))
  it('cannot create an invite', () =>
    assertFails(as(A).doc('invites/mine').set({ groupId: G1, email: null, invitedBy: A })))
  it('cannot extend an invite', () =>
    assertFails(as(A).doc('invites/tok1').update({ expiresAt: null })))
})

describe('A (owner) reaching outside their group', () => {
  it("cannot read B's group", () => assertFails(as(A).doc(`groups/${G2}`).get()))
  it('cannot list every group (no memberIds filter)', () =>
    assertFails(as(A).collection('groups').get()))
  it("cannot read B's users document", () => assertFails(as(A).doc(`users/${B}`).get()))
  it("cannot read C's users document even though they share a group", () =>
    assertFails(as(A).doc(`users/${C}`).get()))
  it('cannot run a collection-group query on activity', () =>
    assertFails(as(A).collectionGroup('activity').get()))
  it('cannot run a collection-group query on members', () =>
    assertFails(as(A).collectionGroup('members').where('displayName', '==', 'Bayo').get()))
  it('cannot read or write an unknown collection', async () => {
    await assertFails(as(A).doc('secrets/x').get())
    await assertFails(as(A).doc('secrets/x').set({ a: 1 }))
  })
})

describe('C (plain member)', () => {
  it('can read the group and its expenses', async () => {
    await assertSucceeds(as(C).doc(`groups/${G1}`).get())
    await assertSucceeds(as(C).collection(`groups/${G1}/expenses`).get())
  })
  it('cannot read invites (owner only)', () =>
    assertFails(as(C).collection('invites').where('groupId', '==', G1).get()))
  it('cannot read a single invite by token', () => assertFails(as(C).doc('invites/tok1').get()))
  it('cannot promote themselves to owner', () =>
    assertFails(as(C).doc(`groups/${G1}/members/${C}`).update({ role: 'owner' })))
  it('cannot record a payment directly', () =>
    assertFails(as(C).doc(`groups/${G1}/payments/x`).set(fakePayment)))
  it("cannot edit A's expense", () =>
    assertFails(as(C).doc(`groups/${G1}/expenses/e1`).update({ title: 'Mine now' })))
})

describe("B (outsider) reading A's group", () => {
  it('cannot read the group', () => assertFails(as(B).doc(`groups/${G1}`).get()))
  it("cannot query groups where memberIds contains A's uid", () =>
    assertFails(as(B).collection('groups').where('memberIds', 'array-contains', A).get()))
  it('can still list their own groups', () =>
    assertSucceeds(as(B).collection('groups').where('memberIds', 'array-contains', B).get()))
  it('gets the same denial for a group that does not exist', () =>
    assertFails(as(B).doc('groups/does-not-exist').get()))
  it('cannot read a member document', () =>
    assertFails(as(B).doc(`groups/${G1}/members/${A}`).get()))
  it('cannot list members', () => assertFails(as(B).collection(`groups/${G1}/members`).get()))
  it('cannot read an expense', () => assertFails(as(B).doc(`groups/${G1}/expenses/e1`).get()))
  it('cannot list expenses', () => assertFails(as(B).collection(`groups/${G1}/expenses`).get()))
  it('cannot read a payment', () => assertFails(as(B).doc(`groups/${G1}/payments/p1`).get()))
  it('cannot list payments', () => assertFails(as(B).collection(`groups/${G1}/payments`).get()))
  it('cannot read an activity entry', () =>
    assertFails(as(B).doc(`groups/${G1}/activity/a1`).get()))
  it('cannot list activity', () => assertFails(as(B).collection(`groups/${G1}/activity`).get()))
  it('cannot read an invite, even knowing the token', () =>
    assertFails(as(B).doc('invites/tok1').get()))
  it("cannot list the group's invites", () =>
    assertFails(as(B).collection('invites').where('groupId', '==', G1).get()))
  it("cannot read A's users document", () => assertFails(as(B).doc(`users/${A}`).get()))
})

describe("B (outsider) writing into A's group", () => {
  it('cannot add themselves to memberIds', () =>
    assertFails(
      as(B)
        .doc(`groups/${G1}`)
        .update({ memberIds: [A, C, B] }),
    ))
  it('cannot create their own member document (join without invite)', () =>
    assertFails(as(B).doc(`groups/${G1}/members/${B}`).set({ role: 'owner' })))
  it('cannot add an expense', () =>
    assertFails(
      as(B)
        .doc(`groups/${G1}/expenses/x`)
        .set({ ...fakeExpense, paidBy: B }),
    ))
  it('cannot delete an expense', () => assertFails(as(B).doc(`groups/${G1}/expenses/e1`).delete()))
  it('cannot record a payment', () =>
    assertFails(as(B).doc(`groups/${G1}/payments/x`).set(fakePayment)))
  it('cannot write activity', () =>
    assertFails(as(B).doc(`groups/${G1}/activity/x`).set({ actorId: B, kind: 'fake' })))
  it('cannot create an invite to the group', () =>
    assertFails(as(B).doc('invites/b-made').set({ groupId: G1, email: EMAIL[B], invitedBy: B })))
  it('cannot accept an invite by editing it', () =>
    assertFails(as(B).doc('invites/tok1').update({ acceptedAt: serverTime() })))
  it("cannot write A's users document", () =>
    assertFails(as(B).doc(`users/${A}`).update({ weeklyReminders: false })))
})

describe('users/{uid}: creating your own profile', () => {
  const D = 'dave'
  const asD = () => env.authenticatedContext(D, { email: 'dave@example.com' }).firestore()
  const valid = () => ({
    displayName: 'Dave',
    email: 'dave@example.com',
    photoURL: null,
    photoPath: null,
    defaultCurrency: 'NGN',
    weeklyReminders: true,
    createdAt: serverTime(),
  })

  it('rejects an email that is not the signed-in email', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), email: 'alice@example.com' }),
    ))
  it('rejects a photoURL that is not from the sign-in', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), photoURL: 'https://evil.example/x.png' }),
    ))
  it('rejects an uploaded photoPath at creation', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), photoPath: `avatars/${D}/x.jpg` }),
    ))
  it('rejects an extra field', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), isAdmin: true }),
    ))
  it('rejects a missing field', () => {
    const missing: Record<string, unknown> = valid()
    delete missing.weeklyReminders
    return assertFails(asD().doc(`users/${D}`).set(missing))
  })
  it('rejects an unsupported currency', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), defaultCurrency: 'BTC' }),
    ))
  it('rejects an empty display name', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), displayName: '' }),
    ))
  it('rejects a display name over 60 characters', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), displayName: 'x'.repeat(61) }),
    ))
  it('rejects a createdAt that is not the server time', () =>
    assertFails(
      asD()
        .doc(`users/${D}`)
        .set({ ...valid(), createdAt: new Date(0) }),
    ))
  it("rejects creating someone else's document", () =>
    assertFails(asD().doc('users/someone-else').set(valid())))
  it('accepts a valid profile for yourself', () =>
    assertSucceeds(asD().doc(`users/${D}`).set(valid())))
})

describe('users/{uid}: editing your own profile', () => {
  it('can change defaultCurrency', () =>
    assertSucceeds(as(A).doc(`users/${A}`).update({ defaultCurrency: 'GBP' })))
  it('can change weeklyReminders', () =>
    assertSucceeds(as(A).doc(`users/${A}`).update({ weeklyReminders: false })))
  it('cannot set an unsupported currency', () =>
    assertFails(as(A).doc(`users/${A}`).update({ defaultCurrency: 'XYZ' })))
  it('cannot set weeklyReminders to a non-boolean', () =>
    assertFails(as(A).doc(`users/${A}`).update({ weeklyReminders: 'yes' })))
  it('cannot change displayName directly (must use updateProfile)', () =>
    assertFails(as(A).doc(`users/${A}`).update({ displayName: 'Ada L.' })))
  it('cannot change photoPath directly (must use updateProfile)', () =>
    assertFails(
      as(A)
        .doc(`users/${A}`)
        .update({ photoPath: `avatars/${A}/me.jpg` }),
    ))
  it('cannot change email', () =>
    assertFails(as(A).doc(`users/${A}`).update({ email: 'new@example.com' })))
  it('cannot change photoURL', () =>
    assertFails(as(A).doc(`users/${A}`).update({ photoURL: 'https://x.example/p.png' })))
  it('cannot change createdAt', () =>
    assertFails(
      as(A)
        .doc(`users/${A}`)
        .update({ createdAt: new Date(0) }),
    ))
  it('cannot add a new field', () => assertFails(as(A).doc(`users/${A}`).update({ role: 'admin' })))
  it('cannot overwrite the whole document with set()', () =>
    assertFails(as(A).doc(`users/${A}`).set({ defaultCurrency: 'USD' })))
  it('cannot delete their profile', () => assertFails(as(A).doc(`users/${A}`).delete()))
})
