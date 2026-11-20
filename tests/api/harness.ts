import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import firebase from 'firebase/compat/app'
import { afterAll, beforeAll, expect } from 'vitest'
import { startApiServer } from '../../server/http/node'
import { postApi } from '../../src/lib/apiClient'

// Shared setup for the API tests: the real handlers (server/), served over HTTP by the same code
// pnpm dev uses, and called through the app's own API client (src/lib/apiClient.ts) with an ID
// token from the Auth emulator. Data is seeded and checked with rules disabled, which is how the
// Admin SDK in the handlers sees it.
//
// Each test file runs in its own process and starts its own server on a free port, so a file can
// change the server's environment (storageOff.test.ts turns Storage off).

export const PROJECT_ID = 'demo-splitit'
/** The app's bucket, which the Admin SDK in the handlers also uses. */
export const BUCKET = `gs://${PROJECT_ID}.appspot.com`

firebase.firestore.setLogLevel('silent')

let env: RulesTestEnvironment | undefined
let server: Server | undefined
const apps: FirebaseApp[] = []
let counter = 0

/** Where this file's API server listens, for example http://127.0.0.1:53211/api. */
export function apiBase(): string {
  if (!server) throw new Error('Call useEmulators() at the top of the test file')
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
}

/** Call once per test file, at the top level. Clears the emulators and starts the API server. */
export function useEmulators() {
  beforeAll(async () => {
    // emulators:exec sets these for the command it runs; the Admin SDK in the handlers reads them.
    process.env.GCLOUD_PROJECT ??= PROJECT_ID
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error('Run the API tests with pnpm test:api, which starts the emulators.')
    }
    server = await startApiServer(0)
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
      storage: { rules: readFileSync('storage.rules', 'utf8') },
    })
    await env.clearFirestore()
    await env.clearStorage()
  })
  afterAll(async () => {
    await Promise.all(apps.splice(0).map((a) => deleteApp(a)))
    await env?.cleanup()
    await new Promise((resolve) => server?.close(resolve))
  })
}

function testEnv(): RulesTestEnvironment {
  if (!env) throw new Error('Call useEmulators() at the top of the test file')
  return env
}

export interface TestClient {
  uid: string
  email: string
  /** Calls /api/<name> and returns its result; rejects with an ApiCallError ({ code }) on failure. */
  call: (name: string, data?: unknown) => Promise<unknown>
  /** The current ID token from the Auth emulator (null when signed out). */
  idToken: () => Promise<string | null>
}

/**
 * A fresh client app, signed in with a new Auth-emulator account.
 * `profile` also creates users/{uid} (as the app does on first sign-in); `signedOut` skips sign-in.
 */
export async function client(
  opts: { profile?: string; email?: string; signedOut?: boolean } = {},
): Promise<TestClient> {
  counter += 1
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-api-key' }, `client-${counter}`)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })

  const email = opts.email ?? `user${counter}-${Date.now()}@example.com`
  let uid = ''
  if (!opts.signedOut) {
    uid = (await createUserWithEmailAndPassword(auth, email, 'password123')).user.uid
    if (opts.profile) await seedUser(uid, opts.profile, email)
  }
  return {
    uid,
    email,
    call: async (name, data = {}) =>
      postApi(`${apiBase()}/${name}`, data, (await auth.currentUser?.getIdToken()) ?? null),
    idToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
  }
}

/** Runs `fn` against Firestore with rules disabled and returns its result. */
export function admin<T>(fn: (db: firebase.firestore.Firestore) => Promise<T>): Promise<T> {
  let result!: T
  return testEnv()
    .withSecurityRulesDisabled(async (ctx) => {
      result = await fn(ctx.firestore())
    })
    .then(() => result)
}

/** Writes a file to Storage with rules disabled. */
export async function putFile(path: string, contentType = 'image/jpeg') {
  await testEnv().withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage(BUCKET).ref(path).put(new Uint8Array(512), { contentType })
  })
}

/** Whether a file exists in Storage (read with rules disabled). */
export async function fileExists(path: string): Promise<boolean> {
  let exists = false
  await testEnv().withSecurityRulesDisabled(async (ctx) => {
    exists = await ctx
      .storage(BUCKET)
      .ref(path)
      .getMetadata()
      .then(() => true)
      .catch(() => false)
  })
  return exists
}

export const member = (name: string, role: 'owner' | 'member' = 'member') => ({
  role,
  displayName: name,
  photoPath: null,
  photoURL: null,
  joinedAt: firebase.firestore.Timestamp.now(),
})

export async function seedUser(uid: string, name: string, email = `${uid}@example.com`) {
  await admin((db) =>
    db.doc(`users/${uid}`).set({
      displayName: name,
      email,
      photoURL: null,
      photoPath: null,
      defaultCurrency: 'NGN',
      weeklyReminders: false,
      createdAt: firebase.firestore.Timestamp.now(),
    }),
  )
}

/** Creates a group whose members are given as { uid: displayName }; the first one is owner. */
export async function seedGroup(gid: string, members: Record<string, string>) {
  await admin(async (db) => {
    const uids = Object.keys(members)
    await db.doc(`groups/${gid}`).set({
      name: gid,
      memberIds: uids,
      currency: 'NGN',
      balances: Object.fromEntries(uids.map((u) => [u, 0])),
      pastMembers: {},
    })
    await Promise.all(
      uids.map((uid, i) =>
        db
          .doc(`groups/${gid}/members/${uid}`)
          .set(member(members[uid] ?? '', i === 0 ? 'owner' : 'member')),
      ),
    )
  })
}

export const read = (path: string) => admin(async (db) => (await db.doc(path).get()).data())

export async function expectCode(call: Promise<unknown>, code: string, message?: RegExp) {
  await expect(call).rejects.toMatchObject({ code: `functions/${code}` })
  if (message) await expect(call).rejects.toThrow(message)
}
