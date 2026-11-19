import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { EMULATOR_HOST, app, usingEmulators } from './firebase'

// Storage and Functions, kept apart from firebase.ts so only the signed-in screens that upload
// photos or call functions load them.

/** Same region as the functions (functions/src/lib/options.ts). */
export const FUNCTIONS_REGION = 'europe-west1'

export const storage = getStorage(app)
export const functions = getFunctions(app, FUNCTIONS_REGION)

if (usingEmulators) {
  connectStorageEmulator(storage, EMULATOR_HOST, 9199)
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001)
}
