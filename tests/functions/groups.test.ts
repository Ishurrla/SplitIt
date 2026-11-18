import firebase from 'firebase/compat/app'
import { describe, expect, it } from 'vitest'
import {
  admin,
  client,
  expectCode,
  fileExists,
  putFile,
  read,
  useEmulators,
  type TestClient,
} from './harness'

// createGroup, updateGroup, createInvite, invitePreview, acceptInvite, leaveGroup, removeMember.
useEmulators()

async function newGroup(owner: TestClient, name = 'Lekki flat') {
  return (await owner.call('createGroup', { name, currency: 'NGN', cover: 'flat' })) as {
    groupId: string
  }
}
async function linkInvite(c: TestClient, groupId: string) {
  return (await c.call('createInvite', { groupId })) as { token: string; reused: boolean }
}
async function joinWith(c: TestClient, token: string) {
  return (await c.call('acceptInvite', { token })) as { groupId: string; alreadyMember: boolean }
}
/** Owner A, plus B who joined with a link. */
async function groupOfTwo() {
  const a = await client({ profile: 'Ada' })
  const b = await client({ profile: 'Bayo' })
  const { groupId } = await newGroup(a)
  await joinWith(b, (await linkInvite(a, groupId)).token)
  return { a, b, groupId }
}
const setBalances = (groupId: string, balances: Record<string, number>) =>
  admin((db) => db.doc(`groups/${groupId}`).update({ balances }))
const activityKinds = (groupId: string) =>
  admin(async (db) =>
    (await db.collection(`groups/${groupId}/activity`).get()).docs.map(
      (d) => d.get('kind') as string,
    ),
  )

describe('createGroup', () => {
  it('creates the group with you as owner, a zero balance and an activity entry', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a, '  Abuja trip  ')
    const group = await read(`groups/${groupId}`)
    expect(group).toMatchObject({
      name: 'Abuja trip',
      currency: 'NGN',
      cover: 'flat',
      coverPath: null,
      createdBy: a.uid,
      memberIds: [a.uid],
      balances: { [a.uid]: 0 },
      pastMembers: {},
    })
    expect(await read(`groups/${groupId}/members/${a.uid}`)).toMatchObject({
      role: 'owner',
      displayName: 'Ada',
    })
    expect(await activityKinds(groupId)).toEqual(['group.created'])
  })

  it('refuses a signed-out caller', async () => {
    const anon = await client({ signedOut: true })
    await expectCode(
      anon.call('createGroup', { name: 'X', currency: 'NGN', cover: 'plain' }),
      'unauthenticated',
    )
  })

  it('refuses an empty name, an unknown currency, an unknown cover and extra fields', async () => {
    const a = await client({ profile: 'Ada' })
    const ok = { name: 'X', currency: 'NGN', cover: 'plain' }
    await expectCode(a.call('createGroup', { ...ok, name: ' ' }), 'invalid-argument', /name/)
    await expectCode(
      a.call('createGroup', { ...ok, currency: 'BTC' }),
      'invalid-argument',
      /currency/,
    )
    await expectCode(a.call('createGroup', { ...ok, cover: 'space' }), 'invalid-argument')
    await expectCode(a.call('createGroup', { ...ok, balances: { x: 5 } }), 'invalid-argument')
  })

  it('refuses when your profile does not exist yet', async () => {
    const noProfile = await client()
    await expectCode(
      noProfile.call('createGroup', { name: 'X', currency: 'NGN', cover: 'plain' }),
      'failed-precondition',
    )
  })
})

describe('updateGroup', () => {
  it('lets the owner rename and change the illustration', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    await a.call('updateGroup', { groupId, name: 'Flat 4B', cover: 'dinner' })
    expect(await read(`groups/${groupId}`)).toMatchObject({ name: 'Flat 4B', cover: 'dinner' })
  })

  it('sets an uploaded cover photo, and deletes the old one when it is replaced', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    await putFile(`covers/${groupId}/one.jpg`)
    await putFile(`covers/${groupId}/two.jpg`)
    await a.call('updateGroup', { groupId, coverPath: `covers/${groupId}/one.jpg` })
    await a.call('updateGroup', { groupId, coverPath: `covers/${groupId}/two.jpg` })
    expect((await read(`groups/${groupId}`))?.coverPath).toBe(`covers/${groupId}/two.jpg`)
    expect(await fileExists(`covers/${groupId}/one.jpg`)).toBe(false)
    expect(await fileExists(`covers/${groupId}/two.jpg`)).toBe(true)
  })

  it("refuses a cover from another group's folder, or one never uploaded", async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    await expectCode(
      a.call('updateGroup', { groupId, coverPath: 'covers/other/x.jpg' }),
      'invalid-argument',
    )
    await expectCode(
      a.call('updateGroup', { groupId, coverPath: `covers/${groupId}/missing.jpg` }),
      'failed-precondition',
    )
  })

  it('refuses a plain member, and an outsider gets the same answer as for a missing group', async () => {
    const { b, groupId } = await groupOfTwo()
    const outsider = await client({ profile: 'Olu' })
    await expectCode(b.call('updateGroup', { groupId, name: 'Mine' }), 'permission-denied', /owner/)
    await expectCode(
      outsider.call('updateGroup', { groupId, name: 'Mine' }),
      'permission-denied',
      /not in this group/,
    )
    await expectCode(
      outsider.call('updateGroup', { groupId: 'noSuchGroup', name: 'Mine' }),
      'permission-denied',
      /not in this group/,
    )
  })

  it('cannot change the currency', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    await expectCode(a.call('updateGroup', { groupId, currency: 'USD' }), 'invalid-argument')
  })
})

describe('createInvite', () => {
  it('gives the same link twice, so links already shared keep working', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    const first = await linkInvite(a, groupId)
    const second = await linkInvite(a, groupId)
    expect(second.token).toBe(first.token)
    expect(second.reused).toBe(true)
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{22}$/) // 128 random bits
    expect(await read(`invites/${first.token}`)).toMatchObject({
      groupId,
      email: null,
      invitedBy: a.uid,
      acceptedAt: null,
    })
  })

  it('makes a new link when the current one has less than a day left', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    const first = await linkInvite(a, groupId)
    await admin((db) =>
      db
        .doc(`invites/${first.token}`)
        .update({ expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 3_600_000) }),
    )
    expect((await linkInvite(a, groupId)).token).not.toBe(first.token)
  })

  it('lets a plain member invite too', async () => {
    const { b, groupId } = await groupOfTwo()
    expect((await linkInvite(b, groupId)).token).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('makes a personal email invite (lower-cased), reuses it for the same address, and logs it', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    const one = (await a.call('createInvite', { groupId, email: ' Chi@Example.com ' })) as {
      token: string
    }
    const two = (await a.call('createInvite', { groupId, email: 'chi@example.com' })) as {
      token: string
    }
    expect(two.token).toBe(one.token)
    expect((await read(`invites/${one.token}`))?.email).toBe('chi@example.com')
    expect(await activityKinds(groupId)).toContain('invite.created')
  })

  it('refuses to invite someone who is already a member', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await expectCode(a.call('createInvite', { groupId, email: b.email }), 'already-exists')
  })

  it('refuses an outsider and a bad email', async () => {
    const a = await client({ profile: 'Ada' })
    const outsider = await client({ profile: 'Olu' })
    const { groupId } = await newGroup(a)
    await expectCode(outsider.call('createInvite', { groupId }), 'permission-denied')
    await expectCode(a.call('createInvite', { groupId, email: 'not-an-email' }), 'invalid-argument')
  })
})

describe('invitePreview', () => {
  it("shows a non-member only the group's name and who invited them", async () => {
    const a = await client({ profile: 'Ada' })
    const visitor = await client({ profile: 'Vee' })
    const { groupId } = await newGroup(a, 'Friday dinners')
    const { token } = await linkInvite(a, groupId)
    expect(await visitor.call('invitePreview', { token })).toEqual({
      status: 'valid',
      groupName: 'Friday dinners',
      inviterName: 'Ada',
      groupId: null,
    })
  })

  it('tells a member they are already in, with the group id', async () => {
    const { a, groupId } = await groupOfTwo()
    const { token } = await linkInvite(a, groupId)
    expect(await a.call('invitePreview', { token })).toMatchObject({
      status: 'already-member',
      groupId,
    })
  })

  it('reports expired, wrong-email and used invites', async () => {
    const a = await client({ profile: 'Ada' })
    const chi = await client({ profile: 'Chi' })
    const other = await client({ profile: 'Olu' })
    const { groupId } = await newGroup(a)
    const { token } = (await a.call('createInvite', { groupId, email: chi.email })) as {
      token: string
    }
    expect(await other.call('invitePreview', { token })).toMatchObject({ status: 'wrong-email' })
    await joinWith(chi, token)
    expect(await other.call('invitePreview', { token })).toMatchObject({ status: 'used' })

    const link = await linkInvite(a, groupId)
    await admin((db) =>
      db
        .doc(`invites/${link.token}`)
        .update({ expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() - 1000) }),
    )
    expect(await other.call('invitePreview', { token: link.token })).toMatchObject({
      status: 'expired',
    })
  })

  it('answers not-found for a made-up token', async () => {
    const visitor = await client({ profile: 'Vee' })
    await expectCode(
      visitor.call('invitePreview', { token: 'madeUpToken1234567890a' }),
      'not-found',
      /doesn't work/,
    )
  })

  it('requires sign-in', async () => {
    const anon = await client({ signedOut: true })
    await expectCode(anon.call('invitePreview', { token: 'whatever' }), 'unauthenticated')
  })
})

describe('acceptInvite', () => {
  it('joins with a link: member document, memberIds, zero balance and an activity entry', async () => {
    const { a, b, groupId } = await groupOfTwo()
    const group = await read(`groups/${groupId}`)
    expect(group?.memberIds).toEqual([a.uid, b.uid])
    expect(group?.balances).toEqual({ [a.uid]: 0, [b.uid]: 0 })
    expect(await read(`groups/${groupId}/members/${b.uid}`)).toMatchObject({
      role: 'member',
      displayName: 'Bayo',
    })
    expect(await activityKinds(groupId)).toContain('member.joined')
  })

  it('lets many people use the same link', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    const { token } = await linkInvite(a, groupId)
    for (const name of ['B', 'C', 'D']) await joinWith(await client({ profile: name }), token)
    expect((await read(`groups/${groupId}`))?.memberIds as string[]).toHaveLength(4)
  })

  it('does nothing when you are already a member', async () => {
    const { a, groupId } = await groupOfTwo()
    const { token } = await linkInvite(a, groupId)
    expect(await joinWith(a, token)).toEqual({ groupId, alreadyMember: true })
  })

  it('accepts an email invite only for that address, and only once', async () => {
    const a = await client({ profile: 'Ada' })
    const chi = await client({ profile: 'Chi' })
    const intruder = await client({ profile: 'Ivy' })
    const { groupId } = await newGroup(a)
    const { token } = (await a.call('createInvite', { groupId, email: chi.email })) as {
      token: string
    }

    // The error hints at the right address without revealing it.
    const wrongPerson = intruder.call('acceptInvite', { token })
    await expectCode(
      wrongPerson,
      'permission-denied',
      /This invite is for u•••@example\.com\. Sign in with that address/,
    )
    await expect(wrongPerson).rejects.not.toThrow(chi.email)
    await joinWith(chi, token)
    expect((await read(`invites/${token}`))?.acceptedAt).not.toBeNull()
    await expectCode(
      intruder.call('acceptInvite', { token }),
      'failed-precondition',
      /already been used/,
    )
  })

  it('refuses an expired invite', async () => {
    const a = await client({ profile: 'Ada' })
    const late = await client({ profile: 'Late' })
    const { groupId } = await newGroup(a)
    const { token } = await linkInvite(a, groupId)
    await admin((db) =>
      db
        .doc(`invites/${token}`)
        .update({ expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() - 1) }),
    )
    await expectCode(late.call('acceptInvite', { token }), 'failed-precondition', /expired/)
    expect((await read(`groups/${groupId}`))?.memberIds).toEqual([a.uid])
  })

  it('refuses when the group already has 50 members', async () => {
    const a = await client({ profile: 'Ada' })
    const fifty = await client({ profile: 'Fifty' })
    const { groupId } = await newGroup(a)
    const { token } = await linkInvite(a, groupId)
    const filler = Array.from({ length: 49 }, (_, i) => `filler${i}`)
    await admin((db) => db.doc(`groups/${groupId}`).update({ memberIds: [a.uid, ...filler] }))
    await expectCode(fifty.call('acceptInvite', { token }), 'resource-exhausted')
  })

  it('refuses an invite whose group was deleted', async () => {
    const a = await client({ profile: 'Ada' })
    const late = await client({ profile: 'Late' })
    const { groupId } = await newGroup(a)
    const { token } = await linkInvite(a, groupId)
    await a.call('leaveGroup', { groupId }) // last member: group deleted, invites too
    await expectCode(late.call('acceptInvite', { token }), 'not-found')
  })
})

describe('leaveGroup', () => {
  it('takes you out: member document, memberIds and balance gone, name kept in pastMembers', async () => {
    const { a, b, groupId } = await groupOfTwo()
    expect(await b.call('leaveGroup', { groupId })).toEqual({ groupDeleted: false })
    const group = await read(`groups/${groupId}`)
    expect(group?.memberIds).toEqual([a.uid])
    expect(group?.balances).toEqual({ [a.uid]: 0 })
    expect(group?.pastMembers).toEqual({ [b.uid]: { displayName: 'Bayo' } })
    expect(await read(`groups/${groupId}/members/${b.uid}`)).toBeUndefined()
    expect(await activityKinds(groupId)).toContain('member.left')
  })

  it('refuses while you owe or are owed money', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await setBalances(groupId, { [a.uid]: 5000, [b.uid]: -5000 })
    await expectCode(b.call('leaveGroup', { groupId }), 'failed-precondition', /Settle up first/)
    await expectCode(a.call('leaveGroup', { groupId }), 'failed-precondition')
  })

  it('hands ownership to the longest-standing member when the owner leaves', async () => {
    const { a, b, groupId } = await groupOfTwo()
    const c = await client({ profile: 'Chi' })
    await joinWith(c, (await linkInvite(a, groupId)).token)
    await a.call('leaveGroup', { groupId })
    expect((await read(`groups/${groupId}/members/${b.uid}`))?.role).toBe('owner')
    expect((await read(`groups/${groupId}/members/${c.uid}`))?.role).toBe('member')
  })

  it('deletes the group, its invites and its files when the last member leaves', async () => {
    const a = await client({ profile: 'Ada' })
    const { groupId } = await newGroup(a)
    const { token } = await linkInvite(a, groupId)
    await putFile(`covers/${groupId}/c.jpg`)
    expect(await a.call('leaveGroup', { groupId })).toEqual({ groupDeleted: true })
    expect(await read(`groups/${groupId}`)).toBeUndefined()
    const leftovers = await admin(
      async (db) => (await db.collection(`groups/${groupId}/activity`).get()).size,
    )
    expect(leftovers).toBe(0)
    expect(await read(`invites/${token}`)).toBeUndefined()
    expect(await fileExists(`covers/${groupId}/c.jpg`)).toBe(false)
  })

  it('lets someone who left join again with a new invite', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await b.call('leaveGroup', { groupId })
    await joinWith(b, (await linkInvite(a, groupId)).token)
    const group = await read(`groups/${groupId}`)
    expect(group?.memberIds).toEqual([a.uid, b.uid])
    expect(group?.pastMembers).toEqual({})
  })

  it('refuses an outsider', async () => {
    const { groupId } = await groupOfTwo()
    const outsider = await client({ profile: 'Olu' })
    await expectCode(outsider.call('leaveGroup', { groupId }), 'permission-denied')
  })
})

describe('removeMember', () => {
  it('lets the owner remove a member with a zero balance', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await a.call('removeMember', { groupId, uid: b.uid })
    expect((await read(`groups/${groupId}`))?.memberIds).toEqual([a.uid])
    expect(await activityKinds(groupId)).toContain('member.removed')
    // and B has lost access straight away
    await expectCode(b.call('createInvite', { groupId }), 'permission-denied')
  })

  it('refuses while that member owes or is owed money', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await setBalances(groupId, { [a.uid]: -100, [b.uid]: 100 })
    await expectCode(a.call('removeMember', { groupId, uid: b.uid }), 'failed-precondition', /Bayo/)
  })

  it('refuses a plain member, removing yourself, and someone not in the group', async () => {
    const { a, b, groupId } = await groupOfTwo()
    await expectCode(b.call('removeMember', { groupId, uid: a.uid }), 'permission-denied', /owner/)
    await expectCode(
      a.call('removeMember', { groupId, uid: a.uid }),
      'invalid-argument',
      /Leave group/,
    )
    await expectCode(a.call('removeMember', { groupId, uid: 'stranger' }), 'not-found')
  })
})
