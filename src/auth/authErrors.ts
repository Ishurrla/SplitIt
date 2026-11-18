/**
 * Turns a Firebase Auth error into a sentence that says what went wrong and what to do.
 * Returns null when there is nothing to tell the person (they closed the Google window themselves).
 */
export function authErrorMessage(error: unknown): string | null {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return "That email and password don't match. Check both, or sign up if you're new."
    case 'auth/email-already-in-use':
      return 'That email already has an account. Log in instead.'
    case 'auth/invalid-email':
      return 'That email looks incomplete. Check the @ and the dot.'
    case 'auth/weak-password':
      return 'Use at least 8 characters for the password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute, then try again.'
    case 'auth/network-request-failed':
      return "Couldn't reach the server. Check your connection and try again."
    case 'auth/account-exists-with-different-credential':
      return 'That email already signs in another way. Log in with your email and password.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.'
    case 'auth/unauthorized-domain':
      return "Google sign-in isn't set up for this web address yet. Use email and password for now."
    default:
      return 'Something went wrong signing you in. Try again.'
  }
}

/** Client-side checks before calling Firebase, worded like the prototype. */
export function signInFormProblem(
  form: { name?: string; email: string; password: string },
  mode: 'login' | 'signup',
): string | null {
  if (mode === 'signup' && !form.name?.trim()) return 'Add your name so friends recognise you.'
  if (mode === 'signup' && (form.name?.trim().length ?? 0) > 60)
    return 'Use 60 characters or fewer for your name.'
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(form.email.trim()))
    return 'That email looks incomplete. Check the @ and the dot.'
  if (form.password.length < 8) return 'Use at least 8 characters for the password.'
  return null
}
