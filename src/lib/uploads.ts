// Photo uploads (receipts, covers, profile photos) use Firebase Storage, which needs the paid
// Blaze plan, so they only exist in the emulator version. On the live site no screen offers an
// upload and nothing calls Storage: covers use the illustrations, avatars use the Google profile
// photo or an illustration.
//
// Kept free of Firebase imports (Storage is loaded only when a photo is actually used), so the
// live site never downloads the Storage SDK and components using this stay easy to test.

const env = import.meta.env as Record<string, string | undefined>

/** True only on the emulators, with VITE_STORAGE_UPLOADS=true. */
export const STORAGE_UPLOADS =
  env.VITE_USE_EMULATORS === 'true' && env.VITE_STORAGE_UPLOADS === 'true'

/** The one-line note shown where an upload would be. */
export const UPLOADS_NOTE =
  'Photo uploads only work in the local emulator version, because Firebase Storage needs the paid plan.'

async function storageApi() {
  if (!STORAGE_UPLOADS) throw new Error('Photo uploads are turned off on this site.')
  const [sdk, { storage }] = await Promise.all([
    import('firebase/storage'),
    import('./firebaseServices'),
  ])
  return { sdk, storage }
}

/** Uploads a JPEG to `path`. */
export async function uploadJpeg(path: string, jpeg: Blob): Promise<void> {
  const { sdk, storage } = await storageApi()
  await sdk.uploadBytes(sdk.ref(storage, path), jpeg, { contentType: 'image/jpeg' })
}

/** A download URL for a file the rules let me read. */
export async function downloadUrl(path: string): Promise<string> {
  const { sdk, storage } = await storageApi()
  return sdk.getDownloadURL(sdk.ref(storage, path))
}
