import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// The web config is public by design: it identifies the project, it does not grant access.
// Access is controlled by Auth plus firestore.rules and storage.rules.
// Only Auth and Firestore live here: every screen needs them. Storage and Functions are in
// firebaseServices.ts, so the landing and sign-in pages don't download them.

function required(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name]
  if (!value) {
    throw new Error(`${name} is missing. Copy .env.example to .env.local, then restart pnpm dev.`)
  }
  return value
}

export const app = initializeApp({
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  appId: required('VITE_FIREBASE_APP_ID'),
})

export const auth = getAuth(app)
export const db = getFirestore(app)

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'
export const EMULATOR_HOST = '127.0.0.1'

if (usingEmulators) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080)
}
