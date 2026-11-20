import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'

// firebase-admin, set up once per server instance.
//
// Two ways to run, never both:
// - Emulators (local dev and tests): FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST
//   (and FIREBASE_STORAGE_EMULATOR_HOST for photos) with GCLOUD_PROJECT set to a demo-* project.
// - A real project (Vercel): FIREBASE_SERVICE_ACCOUNT, the service-account key JSON in base64.
//   It is set only in Vercel's environment variables, never in git or in the client.

const EMULATOR_VARS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
] as const

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

function readServiceAccount(encoded: string): ServiceAccount {
  let account: Partial<ServiceAccount>
  try {
    account = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Partial<ServiceAccount>
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not base64-encoded JSON.')
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not a service-account key.')
  }
  return account as ServiceAccount
}

export function adminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const env = process.env
  const emulated = EMULATOR_VARS.filter((name) => env[name])
  const key = env.FIREBASE_SERVICE_ACCOUNT

  if (emulated.length > 0) {
    if (env.VERCEL_ENV) {
      throw new Error(`Emulator settings (${emulated.join(', ')}) must not be set on Vercel.`)
    }
    if (key) throw new Error('Set either the emulator hosts or FIREBASE_SERVICE_ACCOUNT, not both.')
    if (!env.FIREBASE_AUTH_EMULATOR_HOST || !env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('Set both FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST.')
    }
    const projectId = env.GCLOUD_PROJECT ?? ''
    if (!projectId.startsWith('demo-')) {
      throw new Error('With the emulators, GCLOUD_PROJECT must be a demo-* project id.')
    }
    return initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` })
  }

  if (!key) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set (or set the emulator hosts for local use).',
    )
  }
  const account = readServiceAccount(key)
  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }),
    projectId: account.project_id,
  })
}
