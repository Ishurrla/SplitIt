import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { EMULATOR_HOST, app } from './firebase'
import { STORAGE_UPLOADS } from './uploads'

// Storage. Only loaded by src/lib/uploads.ts, and only when STORAGE_UPLOADS is true (emulators).

export const storage = getStorage(app)

if (STORAGE_UPLOADS) {
  connectStorageEmulator(storage, EMULATOR_HOST, 9199)
}
