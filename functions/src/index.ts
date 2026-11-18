import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'

// Chosen in Phase 0. Firestore and Storage live in the same region.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

initializeApp()

// Callables are added from Phase 3 onwards.
export {}
