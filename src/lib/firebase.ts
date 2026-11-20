import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// The web config is public by design: it identifies the project, it does not grant access.
// Access is controlled by Auth plus firestore.rules and storage.rules.
// Only Auth and Firestore live here: every screen needs them. Storage is in firebaseServices.ts,
// loaded only by the screens that upload photos. Writes go through the API (callables.ts).

function required(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name]
  if (!value) {
    throw new Error(`${name} is missing. Copy .env.example to .env.local, then restart pnpm dev.`)
  }
  return value
}

const config = {
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  appId: required('VITE_FIREBASE_APP_ID'),
  // Only the emulator version has Storage (src/lib/uploads.ts).
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
}

export const app = initializeApp(config)

export const auth = getAuth(app)
export const db = getFirestore(app)

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'
export const EMULATOR_HOST = '127.0.0.1'

if (usingEmulators) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080)
}
