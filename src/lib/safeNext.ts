/**
 * Where to send someone after they sign in. Only paths inside this app are allowed, so a link
 * like /auth?next=https://evil.example cannot bounce a fresh sign-in to another site.
 */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next) return fallback
  // Must be a same-site path: starts with one slash, not "//" (protocol-relative) or "/\".
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  // Never loop back to the sign-in page itself.
  if (next === '/auth' || next.startsWith('/auth?') || next.startsWith('/auth/')) return fallback
  return next
}

/** The /auth URL that brings the visitor back to `path` once they have signed in. */
export function authUrlFor(path: string, mode: 'login' | 'signup' = 'login'): string {
  const params = new URLSearchParams({ next: path })
  if (mode === 'signup') params.set('mode', 'signup')
  return `/auth?${params.toString()}`
}
