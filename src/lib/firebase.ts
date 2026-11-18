import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// The web config is public by design: it identifies the project, it does not grant access.
// Access is controlled by Auth plus firestore.rules and storage.rules.

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

// Same region as the functions (functions/src/lib/options.ts).
export const FUNCTIONS_REGION = 'europe-west1'

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, FUNCTIONS_REGION)

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

if (usingEmulators) {
  const host = '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectStorageEmulator(storage, host, 9199)
  connectFunctionsEmulator(functions, host, 5001)
}
