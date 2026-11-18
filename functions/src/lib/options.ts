import type { CallableOptions } from 'firebase-functions/v2/https'

// Same region as Firestore and Storage (decided in Phase 0).
export const REGION = 'europe-west1'

/**
 * Options for every callable. Passed explicitly to each onCall() rather than set with
 * setGlobalOptions(): ES module imports run before index.ts's own code, so a global set in
 * index.ts arrived too late and the functions silently fell back to us-central1.
 */
export const callableOptions: CallableOptions = {
  region: REGION,
  maxInstances: 10,
}
