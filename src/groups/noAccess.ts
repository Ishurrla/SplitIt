/**
 * "You can't see this group." Raised both when Firestore refuses the read (permission-denied)
 * and when the document doesn't exist, so the screen never reveals which group ids exist.
 * With our rules a non-member gets permission-denied either way; the missing-document case only
 * matters for a member whose group was deleted.
 */
export class NoAccessError extends Error {
  /** What the server actually answered, shown on the "not in this group" screen. */
  readonly serverCode: string
  constructor(serverCode: string) {
    super('No access to this group')
    this.name = 'NoAccessError'
    this.serverCode = serverCode
  }
}

export function firestoreCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null
}
