// Fills the local emulators with demo data: 3 people and 2 groups in different currencies.
// Run with the emulators already started (pnpm emulators), then: pnpm seed
//
// Everything is created through the real Cloud Functions, signed in as each person, exactly as
// the app would do it. So balances, activity and members come out the way the app writes them,
// and the seed doubles as a check that the functions work end to end.
//
// It only ever talks to emulators on this machine under a demo-* project id, and it wipes their
// Auth and Firestore data first, so it can be run again at any time.
import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  terminate,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { writeFileSync } from 'node:fs'

const PROJECT = 'demo-splitit'
const HOST = '127.0.0.1'
const PORTS = { auth: 9099, firestore: 8080, functions: 5001 }
const REGION = 'europe-west1'
const PASSWORD = 'splitit-demo'

// ---------- safety ----------

if (!PROJECT.startsWith('demo-') || !['127.0.0.1', 'localhost'].includes(HOST)) {
  console.error('Refusing to seed: this script only runs against local emulators (demo-* project).')
  process.exit(1)
}

async function reachable(name, url) {
  try {
    await fetch(url)
  } catch {
    console.error(`The ${name} emulator isn't answering at ${url}.`)
    console.error('Start the emulators first with: pnpm emulators')
    process.exit(1)
  }
}

/**
 * The functions emulator opens its port before it has loaded the functions; until then every
 * call is a 404. Wait (up to 2 minutes) until createGroup exists. A plain GET to a callable that
 * is loaded answers 400, because a callable only accepts POST.
 */
async function functionsLoaded() {
  const url = `http://${HOST}:${PORTS.functions}/${PROJECT}/${REGION}/createGroup`
  const deadline = Date.now() + 120_000
  let said = false
  for (;;) {
    const status = await fetch(url).then(
      (r) => r.status,
      () => 0,
    )
    if (status !== 404 && status !== 0) return
    if (Date.now() > deadline) {
      console.error('The functions never loaded. Check the pnpm emulators terminal for errors.')
      process.exit(1)
    }
    if (!said) console.log('Waiting for the functions emulator to load the functions…')
    said = true
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function wipe() {
  const targets = [
    ['Auth', `http://${HOST}:${PORTS.auth}/emulator/v1/projects/${PROJECT}/accounts`],
    [
      'Firestore',
      `http://${HOST}:${PORTS.firestore}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    ],
  ]
  for (const [name, url] of targets) {
    // Retried quietly: after a previous seed, the Firestore emulator answers its first reset with
    // 499 "call already cancelled" (left over from that run's closed connections).
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) break
      const detail = `${res.status} ${(await res.text()).slice(0, 200)}`
      if (attempt === 5) throw new Error(`Could not clear the ${name} emulator: ${detail}`)
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
}

// ---------- people ----------

/** Signs up one person on the emulator and creates the users doc the app makes on first sign-in. */
async function person(displayName, email, defaultCurrency) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, email)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:${PORTS.auth}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, HOST, PORTS.firestore)
  const functions = getFunctions(app, REGION)
  connectFunctionsEmulator(functions, HOST, PORTS.functions)

  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD)
  await updateProfile(user, { displayName })
  await setDoc(doc(db, 'users', user.uid), {
    displayName,
    email,
    photoURL: null,
    photoPath: null,
    defaultCurrency,
    weeklyReminders: true,
    createdAt: serverTimestamp(),
  })
  const call = async (name, data) => (await httpsCallable(functions, name)(data)).data
  return { uid: user.uid, name: displayName, email, db, call }
}

// ---------- money helpers (integer minor units only) ----------

/** 20 letters and digits, the shape saveExpense expects for a new expense id. */
function newExpenseId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => chars[b % 62]).join('')
}

/** Equal shares; the leftover units go to the first people listed, as the app does. */
function equally(amountMinor, people) {
  const base = Math.floor(amountMinor / people.length)
  const extra = amountMinor - base * people.length
  return Object.fromEntries(people.map((p, i) => [p.uid, base + (i < extra ? 1 : 0)]))
}

async function expense(groupId, by, title, amountMinor, splits) {
  await by.call('saveExpense', {
    groupId,
    expenseId: newExpenseId(),
    title,
    amountMinor,
    paidBy: by.uid,
    splits,
    receiptPath: null,
  })
}

// ---------- run ----------

await reachable('Auth', `http://${HOST}:${PORTS.auth}/`)
await reachable('Firestore', `http://${HOST}:${PORTS.firestore}/`)
await reachable('Functions', `http://${HOST}:${PORTS.functions}/`)
await functionsLoaded()
await wipe()

const ada = await person('Ada Okafor', 'ada@example.com', 'NGN')
const bayo = await person('Bayo Lawal', 'bayo@example.com', 'NGN')
const chi = await person('Chi Eze', 'chi@example.com', 'NGN')

// Group 1, naira (kobo, 2 decimals): all three people.
const lekki = (
  await ada.call('createGroup', { name: 'Lekki weekend', currency: 'NGN', cover: 'beach' })
).groupId
const lekkiLink = (await ada.call('createInvite', { groupId: lekki })).token
await bayo.call('acceptInvite', { token: lekkiLink })
await chi.call('acceptInvite', { token: lekkiLink })
const everyone = [ada, bayo, chi]
await expense(lekki, ada, 'Beach house, two nights', 15_000_000, equally(15_000_000, everyone)) // ₦150,000.00
await expense(lekki, bayo, 'Fuel and tolls', 2_500_000, equally(2_500_000, everyone)) // ₦25,000.00, uneven by 1 kobo
await expense(lekki, chi, 'Suya and drinks', 1_845_050, equally(1_845_050, [ada, chi])) // ₦18,450.50, two people
await chi.call('recordPayment', {
  groupId: lekki,
  from: chi.uid,
  to: ada.uid,
  amountMinor: 2_000_000,
}) // ₦20,000.00 back

// Group 2, yen (no decimals): Ada and Bayo only. Chi is the outsider who tries to read it (DEMO.md).
const tokyo = (
  await ada.call('createGroup', { name: 'Tokyo spring', currency: 'JPY', cover: 'trip' })
).groupId
await bayo.call('acceptInvite', {
  token: (await ada.call('createInvite', { groupId: tokyo })).token,
})
await expense(tokyo, bayo, 'Ramen in Shinjuku', 3_001, equally(3_001, [ada, bayo])) // ¥3,001
await expense(tokyo, ada, 'Hotel, three nights', 48_000, equally(48_000, [ada, bayo])) // ¥48,000
await expense(tokyo, ada, 'Train passes', 29_650, { [ada.uid]: 14_825, [bayo.uid]: 14_825 })

// Read the balances back as Ada (a member), to show the result.
const balances = async (groupId) => (await getDoc(doc(ada.db, 'groups', groupId))).data().balances
const named = (b) =>
  Object.fromEntries(everyone.filter((p) => p.uid in b).map((p) => [p.name, b[p.uid]]))
const lekkiBalances = named(await balances(lekki))
const tokyoBalances = named(await balances(tokyo))

await Promise.all(everyone.map((p) => terminate(p.db)))

// For scripts/demo-walkthrough.ps1, which fills these ids into the DEMO.md steps. Git-ignored.
writeFileSync(
  new URL('../.demo-ids.json', import.meta.url),
  JSON.stringify({ lekki, tokyo, ada: ada.uid, bayo: bayo.uid, chi: chi.uid }, null, 2),
)

console.log('\nSeeded the emulators.\n')
console.log(`Sign in with email and password (all three use the password "${PASSWORD}"):`)
console.table(
  everyone.map((p) => ({
    name: p.name,
    email: p.email,
    uid: p.uid,
    groups: p === chi ? 'Lekki weekend' : 'Lekki weekend, Tokyo spring',
  })),
)
console.log('Groups:')
console.table([
  {
    name: 'Lekki weekend',
    currency: 'NGN',
    id: lekki,
    url: `http://localhost:5173/app/groups/${lekki}`,
  },
  {
    name: 'Tokyo spring',
    currency: 'JPY',
    id: tokyo,
    url: `http://localhost:5173/app/groups/${tokyo}`,
  },
])
console.log('Balances in minor units (kobo for NGN, yen for JPY; above zero is owed money):')
console.log('  Lekki weekend:', lekkiBalances)
console.log('  Tokyo spring: ', tokyoBalances)
console.log(
  `\nChi is not in Tokyo spring. Sign in as chi@example.com and open its URL (see DEMO.md).`,
)
process.exit(0)
