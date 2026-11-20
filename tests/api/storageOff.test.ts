import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { newId, save, setupGroup } from './scenario'

// The live site has no Storage (it needs the paid plan). The server turns Storage off when
// FIREBASE_STORAGE_EMULATOR_HOST is not set: photo paths are refused and no file is ever touched.
// The test puts files in the Storage emulator directly, then checks they are left alone.
useEmulators()

let saved: string | undefined
beforeAll(() => {
  // Runs after useEmulators() has set up its test environment, which keeps using the emulator.
  saved = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST
})
afterAll(() => {
  if (saved) process.env.FIREBASE_STORAGE_EMULATOR_HOST = saved
})

const NOT_HERE = /aren't available on this site/

async function pair() {
  const { groupId, people } = await setupGroup(['Ada', 'Bayo'])
  const [a, b] = people as [TestClient, TestClient]
  return { groupId, a, b }
}

describe('with Storage off', () => {
  it('refuses a receipt, a cover photo or a profile photo, even one that exists', async () => {
    const { groupId, a, b } = await pair()
    const expenseId = newId()
    const receipt = `receipts/${groupId}/${expenseId}/r.jpg`
    await putFile(receipt)
    await expectCode(
      save(a, groupId, {
        expenseId,
        amountMinor: 100,
        paidBy: a.uid,
        splits: { [a.uid]: 50, [b.uid]: 50 },
        receiptPath: receipt,
      }),
      'failed-precondition',
      NOT_HERE,
    )
    await putFile(`covers/${groupId}/c.jpg`)
    await expectCode(
      a.call('updateGroup', { groupId, coverPath: `covers/${groupId}/c.jpg` }),
      'failed-precondition',
      NOT_HERE,
    )
    await putFile(`avatars/${a.uid}/me.jpg`)
    await expectCode(
      a.call('updateProfile', { photoPath: `avatars/${a.uid}/me.jpg` }),
      'failed-precondition',
      NOT_HERE,
    )
  })

  it('everything without photos still works, and deleting an expense leaves files alone', async () => {
    const { groupId, a, b } = await pair()
    const { expenseId } = await save(a, groupId, {
      amountMinor: 100,
      paidBy: a.uid,
      splits: { [a.uid]: 50, [b.uid]: 50 },
    })
    // A file that the cleanup would delete if Storage were on.
    const leftover = `receipts/${groupId}/${expenseId}/old.jpg`
    await putFile(leftover)
    await expect(a.call('deleteExpense', { groupId, expenseId })).resolves.toEqual({ ok: true })
    expect(await fileExists(leftover)).toBe(true)

    await expect(a.call('updateGroup', { groupId, coverPath: null })).resolves.toEqual({ ok: true })
  })

  it('removing a profile photo saved earlier leaves the file alone', async () => {
    const c = await client({ profile: 'Chi' })
    const photo = `avatars/${c.uid}/old.jpg`
    await putFile(photo)
    await admin((db) => db.doc(`users/${c.uid}`).update({ photoPath: photo }))
    await expect(c.call('updateProfile', { photoPath: null })).resolves.toEqual({
      groupsUpdated: 0,
    })
    expect((await read(`users/${c.uid}`))?.photoPath).toBeNull()
    expect(await fileExists(photo)).toBe(true)
  })

  it('the last member leaving deletes the group but not its files', async () => {
    const { groupId, people } = await setupGroup(['Solo'])
    const [solo] = people as [TestClient]
    const cover = `covers/${groupId}/c.jpg`
    await putFile(cover)
    await expect(solo.call('leaveGroup', { groupId })).resolves.toEqual({ groupDeleted: true })
    expect(await read(`groups/${groupId}`)).toBeUndefined()
    expect(await fileExists(cover)).toBe(true)
  })
})
