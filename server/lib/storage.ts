import { getStorage } from 'firebase-admin/storage'
import { ApiError } from './errors.js'

/**
 * Storage (receipts, covers, avatars) needs Firebase's paid plan, so it only exists on the local
 * emulators. It is on only when FIREBASE_STORAGE_EMULATOR_HOST is set: the live site never makes
 * a Storage call, and refuses any photo path.
 */
export function storageEnabled(): boolean {
  return Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
}

/** Throws unless Storage is on. Call before accepting a photo path. */
export function requireStorage(): void {
  if (!storageEnabled()) {
    throw new ApiError(
      'failed-precondition',
      "Photo uploads aren't available on this site. They work in the local emulator version.",
    )
  }
}

/** The default bucket. Only call when storageEnabled(). */
export function bucket() {
  return getStorage().bucket()
}
