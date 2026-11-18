import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import firebase from 'firebase/compat/app'

// The fixed world every rules test runs against.
//
//   A (alice)  owns group g1           B (bob)   is in no group with A; owns g2
//   C (carol)  is a plain member of g1
//
// g1 holds one expense, one payment, one activity entry and one pending invite, plus a receipt
// and a cover photo in Storage. Everything is written with rules disabled, like the Admin SDK would.

export const A = 'alice'
export const B = 'bob'
export const C = 'carol'
export const EMAIL = { [A]: 'alice@example.com', [B]: 'bob@example.com', [C]: 'carol@example.com' }

export const G1 = 'g1'
export const G2 = 'g2'
export const RECEIPT = `receipts/${G1}/e1/receipt.jpg`
export const COVER = `covers/${G1}/cover.jpg`
export const AVATAR_A = `avatars/${A}/me.jpg`

export const PROJECT_ID = 'demo-splitit'
// The app's bucket (see .env.example) and the one the Admin SDK uses in the emulator.
// rules-unit-testing would otherwise default to gs://demo-splitit, a different bucket.
export const BUCKET = `gs://${PROJECT_ID}.appspot.com`

// Expected denials would otherwise each print a PERMISSION_DENIED stack to stderr.
firebase.firestore.setLogLevel('silent')

export async function createWorld(): Promise<RulesTestEnvironment> {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
  await env.clearFirestore()
  await env.clearStorage()

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const now = firebase.firestore.Timestamp.now()
    const user = (uid: keyof typeof EMAIL, name: string) => ({
      displayName: name,
      email: EMAIL[uid],
      photoURL: null,
      photoPath: null,
      defaultCurrency: 'NGN',
      weeklyReminders: true,
      createdAt: now,
    })
    const member = (role: 'owner' | 'member', name: string) => ({
      role,
      displayName: name,
      photoPath: null,
      photoURL: null,
      joinedAt: now,
    })

    await db.doc(`users/${A}`).set(user(A, 'Ada'))
    await db.doc(`users/${B}`).set(user(B, 'Bayo'))
    await db.doc(`users/${C}`).set(user(C, 'Chi'))

    await db.doc(`groups/${G1}`).set({
      name: 'Lekki flat',
      cover: 'flat',
      coverPath: COVER,
      currency: 'NGN',
      createdBy: A,
      memberIds: [A, C],
      balances: { [A]: 930_000, [C]: -930_000 },
      createdAt: now,
    })
    await db.doc(`groups/${G1}/members/${A}`).set(member('owner', 'Ada'))
    await db.doc(`groups/${G1}/members/${C}`).set(member('member', 'Chi'))
    await db.doc(`groups/${G1}/expenses/e1`).set({
      title: 'Suya night',
      amountMinor: 1_860_000,
      paidBy: A,
      createdBy: A,
      splits: { [A]: 930_000, [C]: 930_000 },
      splitUserIds: [A, C],
      receiptPath: RECEIPT,
      createdAt: now,
      updatedAt: now,
    })
    await db.doc(`groups/${G1}/payments/p1`).set({
      from: C,
      to: A,
      amountMinor: 100_000,
      createdBy: C,
      createdAt: now,
    })
    await db.doc(`groups/${G1}/activity/a1`).set({
      actorId: A,
      kind: 'expense.added',
      payload: { title: 'Suya night', amountMinor: 1_860_000 },
      createdAt: now,
    })
    await db.doc('invites/tok1').set({
      groupId: G1,
      email: null,
      invitedBy: A,
      acceptedAt: null,
      expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
    })

    await db.doc(`groups/${G2}`).set({
      name: "Bayo's trip",
      cover: 'trip',
      coverPath: null,
      currency: 'GBP',
      createdBy: B,
      memberIds: [B],
      balances: { [B]: 0 },
      createdAt: now,
    })
    await db.doc(`groups/${G2}/members/${B}`).set(member('owner', 'Bayo'))

    const storage = ctx.storage(BUCKET)
    const jpeg = { contentType: 'image/jpeg' }
    await storage.ref(RECEIPT).put(smallFile(), jpeg)
    await storage.ref(COVER).put(smallFile(), jpeg)
    await storage.ref(AVATAR_A).put(smallFile(), jpeg)
  })

  return env
}

/** A tiny file body. Content is irrelevant: rules only see size and content type. */
export function smallFile(bytes = 1024): Uint8Array {
  return new Uint8Array(bytes)
}

/** Matches the client SDK's serverTimestamp(), which the users rules require for createdAt. */
export const serverTime = () => firebase.firestore.FieldValue.serverTimestamp()
