/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  /** Only used with the emulators (photo uploads). */
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_USE_EMULATORS?: string
  /** true: offer receipt, cover and profile photo uploads (emulators only, src/lib/uploads.ts). */
  readonly VITE_STORAGE_UPLOADS?: string
}
