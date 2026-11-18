import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import firebase from 'firebase/compat/app'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Calls the real updateProfile callable on the Functions emulator, signed in through the Auth
// emulator, and checks Firestore afterwards. Data is seeded with rules disabled (like the Admin SDK).

const PROJECT_ID = 'demo-splitit'
const REGION = 'europe-west1'
const BUCKET = `gs://${PROJECT_ID}.appspot.com` // same bucket the Admin SDK uses

let env: RulesTestEnvironment
const apps: FirebaseApp[] = []

firebase.firestore.setLogLevel('silent')

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
  await env.clearFirestore()
  await env.clearStorage()
})

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)))
  await env.cleanup()
})

interface UpdateProfileResult {
  groupsUpdated: number
}

/** A fresh client app. Signed in with a new Auth-emulator account unless signedOut is set. */
async function client(signedOut = false) {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'demo-api-key' },
    `client-${apps.length}`,
  )
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const functions = getFunctions(app, REGION)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  let uid = ''
  if (!signedOut) {
    const email = `user${apps.length}-${Date.now()}@example.com`
    uid = (await createUserWithEmailAndPassword(auth, email, 'password123')).user.uid
  }
  const updateProfile = httpsCallable<unknown, UpdateProfileResult>(functions, 'updateProfile')
  return { uid, updateProfile: async (data: unknown) => (await updateProfile(data)).data }
}

function admin<T>(fn: (db: firebase.firestore.Firestore) => Promise<T>): Promise<T> {
  let result!: T
  return env
    .withSecurityRulesDisabled(async (ctx) => {
      result = await fn(ctx.firestore())
    })
    .then(() => result)
}

const member = (name: string, role: 'owner' | 'member' = 'member') => ({
  role,
  displayName: name,
  photoPath: null,
  photoURL: null,
  joinedAt: firebase.firestore.Timestamp.now(),
})

async function seedUser(uid: string, name: string) {
  await admin((db) =>
    db.doc(`users/${uid}`).set({
      displayName: name,
      email: `${uid}@example.com`,
      photoURL: null,
      photoPath: null,
      defaultCurrency: 'NGN',
      weeklyReminders: false,
      createdAt: firebase.firestore.Timestamp.now(),
    }),
  )
}

/** Creates a group whose members are given as { uid: displayName }. */
async function seedGroup(gid: string, members: Record<string, string>) {
  await admin(async (db) => {
    const uids = Object.keys(members)
    await db.doc(`groups/${gid}`).set({ name: gid, memberIds: uids, currency: 'NGN' })
    await Promise.all(
      uids.map((uid, i) =>
        db
          .doc(`groups/${gid}/members/${uid}`)
          .set(member(members[uid] ?? '', i === 0 ? 'owner' : 'member')),
      ),
    )
  })
}

const read = (path: string) => admin(async (db) => (await db.doc(path).get()).data())

async function expectCode(call: Promise<unknown>, code: string) {
  await expect(call).rejects.toMatchObject({ code: `functions/${code}` })
}

describe('updateProfile: who may call it and with what', () => {
  it('refuses a signed-out caller', async () => {
    const anon = await client(true)
    await expectCode(anon.updateProfile({ displayName: 'Anon' }), 'unauthenticated')
  })

  it('refuses a call that changes nothing', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(me.updateProfile({}), 'invalid-argument')
  })

  it('refuses an empty name', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(me.updateProfile({ displayName: '   ' }), 'invalid-argument')
  })

  it('refuses a name over 60 characters', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(me.updateProfile({ displayName: 'x'.repeat(61) }), 'invalid-argument')
  })

  it('refuses a name with a line break', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(me.updateProfile({ displayName: 'Ada\nLovelace' }), 'invalid-argument')
  })

  it('refuses extra fields such as role', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(me.updateProfile({ displayName: 'Ada', role: 'owner' }), 'invalid-argument')
  })

  it("refuses a photo in someone else's avatars folder", async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(
      me.updateProfile({ photoPath: 'avatars/someone-else/me.jpg' }),
      'invalid-argument',
    )
  })

  it('refuses a photo path outside avatars/', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(
      me.updateProfile({ photoPath: `receipts/g1/e1/${me.uid}.jpg` }),
      'invalid-argument',
    )
  })

  it('refuses a photo that was never uploaded', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await expectCode(
      me.updateProfile({ photoPath: `avatars/${me.uid}/missing.jpg` }),
      'failed-precondition',
    )
  })

  it('refuses when the users document does not exist yet, and writes nothing', async () => {
    const me = await client()
    await seedGroup(`no-profile-${me.uid}`, { [me.uid]: 'Old' })
    await expectCode(me.updateProfile({ displayName: 'New' }), 'failed-precondition')
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

    const result = await me.updateProfile({ displayName: '  Ada Lovelace  ' })

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

    await me.updateProfile({ displayName: 'Ada L.' })

    expect((await read(`groups/shared-${me.uid}/members/neighbour`))?.displayName).toBe('Chi')
    expect((await read(`groups/elsewhere-${me.uid}/members/stranger`))?.displayName).toBe('Dami')
    // role is untouched on your own member document
    expect((await read(`groups/shared-${me.uid}/members/${me.uid}`))?.role).toBe('owner')
  })

  it('sets an uploaded photo on your profile and every copy, then removes it with null', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    await seedGroup(`photo-${me.uid}`, { [me.uid]: 'Ada' })
    const photoPath = `avatars/${me.uid}/me.jpg`
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .storage(BUCKET)
        .ref(photoPath)
        .put(new Uint8Array(512), { contentType: 'image/jpeg' })
    })

    await me.updateProfile({ photoPath })
    expect((await read(`users/${me.uid}`))?.photoPath).toBe(photoPath)
    expect((await read(`groups/photo-${me.uid}/members/${me.uid}`))?.photoPath).toBe(photoPath)

    await me.updateProfile({ photoPath: null })
    expect((await read(`users/${me.uid}`))?.photoPath).toBeNull()
    expect((await read(`groups/photo-${me.uid}/members/${me.uid}`))?.photoPath).toBeNull()
  })

  it('works when you are in no groups yet', async () => {
    const me = await client()
    await seedUser(me.uid, 'Ada')
    expect(await me.updateProfile({ displayName: 'Solo' })).toEqual({ groupsUpdated: 0 })
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

    expect(await me.updateProfile({ displayName: 'Ada Batched' })).toEqual({ groupsUpdated: count })

    const renamed = await admin(
      async (db) =>
        (await db.collectionGroup('members').where('displayName', '==', 'Ada Batched').get()).size,
    )
    expect(renamed).toBe(count)
    expect((await read(`users/${me.uid}`))?.displayName).toBe('Ada Batched')
  })
})
