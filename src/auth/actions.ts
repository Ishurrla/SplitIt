import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { rememberSignUpName } from './profile'

export async function signUpWithEmail(name: string, email: string, password: string) {
  const trimmed = name.trim()
  rememberSignUpName(trimmed)
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await updateProfile(user, { displayName: trimmed })
  } catch (error) {
    rememberSignUpName(null)
    throw error
  }
}

export async function logInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

/** Phones and tablets: popups are unreliable there (blocked, or opened as a new tab). */
function prefersRedirect(): boolean {
  return window.matchMedia('(pointer: coarse) and (max-width: 860px)').matches
}

/**
 * Google sign-in. A popup on desktop; a full-page redirect on phones, or when the browser
 * blocks the popup. After a redirect the AuthProvider picks the user up on return.
 */
export async function signInWithGoogle(): Promise<'done' | 'redirecting'> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  if (prefersRedirect()) {
    await signInWithRedirect(auth, provider)
    return 'redirecting'
  }
  try {
    await signInWithPopup(auth, provider)
    return 'done'
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'auth/popup-blocked'
    ) {
      await signInWithRedirect(auth, provider)
      return 'redirecting'
    }
    throw error
  }
}

export async function logOut() {
  await signOut(auth)
}
