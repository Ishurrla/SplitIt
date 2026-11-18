import type { User } from 'firebase/auth'
import { doc, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { CurrencyCode } from '../lib/money'

/** users/{uid}, as the client reads it. Only the owner can read it (see firestore.rules). */
export interface UserProfile {
  displayName: string
  email: string
  photoURL: string | null
  photoPath: string | null
  defaultCurrency: CurrencyCode
  weeklyReminders: boolean
  createdAt: Timestamp | null // null for a moment while the server timestamp is pending
}

// The name typed into the sign-up form. Set just before the account is created, because
// Firebase reports the new user (and we create the profile) before updateProfile() could run.
let pendingSignUpName: string | null = null
export function rememberSignUpName(name: string | null): void {
  pendingSignUpName = name
}

function nameFor(user: User): string {
  const candidate =
    pendingSignUpName?.trim() || user.displayName?.trim() || user.email?.split('@')[0] || 'Friend'
  return candidate.slice(0, 60)
}

/**
 * Creates users/{uid} the first time someone signs in. Safe to call on every sign-in: inside a
 * transaction it only writes when the document is missing (the rules allow create, not overwrite).
 * Google accounts bring their name and photo; email sign-ups bring the name from the form.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  // The rules compare email and photoURL with the ID token, so read them from the token itself.
  const { claims } = await user.getIdTokenResult()
  const email = typeof claims.email === 'string' ? claims.email : (user.email ?? '')
  const picture = typeof claims.picture === 'string' ? claims.picture : null

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) return
    tx.set(ref, {
      displayName: nameFor(user),
      email,
      photoURL: picture,
      photoPath: null,
      defaultCurrency: 'NGN',
      weeklyReminders: true,
      createdAt: serverTimestamp(),
    })
  })
  pendingSignUpName = null
}
