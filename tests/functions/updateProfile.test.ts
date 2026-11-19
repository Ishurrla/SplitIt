import { describe, expect, it } from 'vitest'
import {
  admin,
  client,
  expectCode,
  fileExists,
  member,
  putFile,
  read,
  seedGroup,
  seedUser,
  useEmulators,
} from './harness'

// updateProfile on the Functions emulator. See harness.ts for the setup.
useEmulators()

const call = (c: { call: (n: string, d?: unknown) => Promise<unknown> }, data: unknown) =>
  c.call('updateProfile', data)

describe('updateProfile: who may call it and with what', () => {
  it('refuses a signed-out caller', async () => {
    const anon = await client({ signedOut: true })
    await expectCode(call(anon, { displayName: 'Anon' }), 'unauthenticated')
  })

  it('refuses a call that changes nothing', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, {}), 'invalid-argument')
  })

  it('refuses an empty name', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { displayName: '   ' }), 'invalid-argument')
  })

  it('refuses a name over 60 characters', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { displayName: 'x'.repeat(61) }), 'invalid-argument')
  })

  it('refuses a name with a line break', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { displayName: 'Ada\nLovelace' }), 'invalid-argument')
  })

  it('refuses extra fields such as role', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { displayName: 'Ada', role: 'owner' }), 'invalid-argument')
  })

  it("refuses a photo in someone else's avatars folder", async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { photoPath: 'avatars/someone-else/me.jpg' }), 'invalid-argument')
  })

  it('refuses a photo path outside avatars/', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(call(me, { photoPath: `receipts/g1/e1/${me.uid}.jpg` }), 'invalid-argument')
  })

  it('refuses a photo that was never uploaded', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(
      call(me, { photoPath: `avatars/${me.uid}/missing.jpg` }),
      'failed-precondition',
    )
  })

  it('refuses when the users document does not exist yet, and writes nothing', async () => {
    const me = await client()
    await seedGroup(`no-profile-${me.uid}`, { [me.uid]: 'Old' })
    await expectCode(call(me, { displayName: 'New' }), 'failed-precondition')
    expect((await read(`groups/no-profile-${me.uid}/members/${me.uid}`))?.displayName).toBe('Old')
  })
})

describe('updateProfile: what it changes', () => {
  it('renames you in users/{uid} and on your member document in every group', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await seedGroup(`flat-${me.uid}`, { [me.uid]: 'Ada', other1: 'Chi' })
    await seedGroup(`trip-${me.uid}`, { other2: 'Bayo', [me.uid]: 'Ada' })
    await seedGroup(`not-mine-${me.uid}`, { other3: 'Dami' })

    const result = await call(me, { displayName: '  Ada Lovelace  ' })

    expect(result).toEqual({ groupsUpdated: 2 })
    expect((await read(`users/${me.uid}`))?.displayName).toBe('Ada Lovelace') // trimmed
    expect((await read(`groups/flat-${me.uid}/members/${me.uid}`))?.displayName).toBe(
      'Ada Lovelace',
    )
    expect((await read(`groups/trip-${me.uid}/members/${me.uid}`))?.displayName).toBe(
      'Ada Lovelace',
    )
  })

  it("leaves other members' copies and other groups alone", async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await seedGroup(`shared-${me.uid}`, { [me.uid]: 'Ada', neighbour: 'Chi' })
    await seedGroup(`elsewhere-${me.uid}`, { stranger: 'Dami' })

    await call(me, { displayName: 'Ada L.' })

    expect((await read(`groups/shared-${me.uid}/members/neighbour`))?.displayName).toBe('Chi')
    expect((await read(`groups/elsewhere-${me.uid}/members/stranger`))?.displayName).toBe('Dami')
    // role is untouched on your own member document
    expect((await read(`groups/shared-${me.uid}/members/${me.uid}`))?.role).toBe('owner')
  })

  it('deletes the old photo file when it is replaced or removed', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    const first = `avatars/${me.uid}/one.jpg`
    const second = `avatars/${me.uid}/two.jpg`
    await putFile(first)
    await putFile(second)
    await call(me, { photoPath: first })
    await call(me, { photoPath: second })
    expect(await fileExists(first)).toBe(false)
    expect(await fileExists(second)).toBe(true)
    await call(me, { photoPath: null })
    expect(await fileExists(second)).toBe(false)
    // A name change leaves the photo alone.
    await putFile(first)
    await call(me, { photoPath: first })
    await call(me, { displayName: 'Ada L.' })
    expect(await fileExists(first)).toBe(true)
  })

  it('sets an uploaded photo on your profile and every copy, then removes it with null', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await seedGroup(`photo-${me.uid}`, { [me.uid]: 'Ada' })
    const photoPath = `avatars/${me.uid}/me.jpg`
    await putFile(photoPath)

    await call(me, { photoPath })
    expect((await read(`users/${me.uid}`))?.photoPath).toBe(photoPath)
    expect((await read(`groups/photo-${me.uid}/members/${me.uid}`))?.photoPath).toBe(photoPath)

    await call(me, { photoPath: null })
    expect((await read(`users/${me.uid}`))?.photoPath).toBeNull()
    expect((await read(`groups/photo-${me.uid}/members/${me.uid}`))?.photoPath).toBeNull()
  })

  it('works when you are in no groups yet', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    expect(await call(me, { displayName: 'Solo' })).toEqual({ groupsUpdated: 0 })
    expect((await read(`users/${me.uid}`))?.displayName).toBe('Solo')
  })

  // The emulator accepts batches over 500 writes, so this proves the result end to end, not the
  // split itself. The split is proven by functions/src/lib/chunks.test.ts.
  it('updates every copy for someone in 520 groups (more than one 500-write batch)', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    const count = 520
    await admin(async (db) => {
      for (let start = 0; start < count; start += 200) {
        const batch = db.batch()
        for (let i = start; i < Math.min(start + 200, count); i++) {
          const gid = `many-${me.uid}-${i}`
          batch.set(db.doc(`groups/${gid}`), { name: gid, memberIds: [me.uid], currency: 'NGN' })
          batch.set(db.doc(`groups/${gid}/members/${me.uid}`), member('Ada', 'owner'))
        }
        await batch.commit()
      }
    })

    expect(await call(me, { displayName: 'Ada Batched' })).toEqual({ groupsUpdated: count })

    const renamed = await admin(
      async (db) =>
        (await db.collectionGroup('members').where('displayName', '==', 'Ada Batched').get()).size,
    )
    expect(renamed).toBe(count)
    expect((await read(`users/${me.uid}`))?.displayName).toBe('Ada Batched')
  })
})
