// Download URL for a file anyone may read (avatars: `allow read: if true` in storage.rules).
// Built directly, without the Storage SDK, so an <img> can use it straight away and components
// that show avatars don't depend on Firebase being set up (which keeps them testable).
// Files the rules protect (receipts, covers) still go through getDownloadURL instead.

export function publicStorageUrl(path: string): string {
  const env = import.meta.env as Record<string, string | undefined>
  const bucket = env.VITE_FIREBASE_STORAGE_BUCKET ?? ''
  const base =
    env.VITE_USE_EMULATORS === 'true'
      ? 'http://127.0.0.1:9199'
      : 'https://firebasestorage.googleapis.com'
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
}
