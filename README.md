# SplitIt

A shared expense splitter: groups, expenses, balances and settle-up, built on Firebase. Money is always kept as whole numbers in each currency's smallest unit (kobo, cents, yen) and is never converted between currencies.

**Live site:** _not deployed yet (see [What runs where](#what-runs-where))_  
**Try it locally in 10 minutes, including trying to read someone else's group:** [DEMO.md](DEMO.md)

## Contents

- [What runs where](#what-runs-where)
- [Setup from a clean Windows machine](#setup-from-a-clean-windows-machine)
- [Environment variables](#environment-variables)
- [Data model](#data-model)
- [How the security rules work](#how-the-security-rules-work)
- [Cloud Functions](#cloud-functions)
- [Settle-up](#settle-up)
- [Realtime design](#realtime-design)
- [The app, screen by screen](#the-app-screen-by-screen)
- [Tests](#tests)
- [Scripts](#scripts)
- [Known limitations](#known-limitations)
- [Docs](#docs)

## What runs where

The project is on the free Spark plan. Cloud Functions and Storage need the Blaze (billing) plan, so the full app currently runs on the Firebase emulators.

| Part                                  | Deployed                                    | Emulator                    |
| ------------------------------------- | ------------------------------------------- | --------------------------- |
| Frontend (React, Vite)                | Vercel (`vercel.json` is ready); link above | `pnpm dev`                  |
| Authentication                        | Not yet; free on Spark                      | ✓                           |
| Firestore and `firestore.rules`       | Not yet; free on Spark                      | ✓ (rules tested)            |
| Cloud Storage and `storage.rules`     | Not yet; needs Blaze                        | ✓ (rules tested)            |
| Cloud Functions (all money logic)     | Not yet; needs Blaze                        | ✓ (every callable tested)   |
| Composite index for `spendingByMonth` | Not yet                                     | ✗ (the emulator ignores it) |

The Firebase project id is `demo-splitit`. Ids that start with `demo-` only work with the emulators and can never reach real cloud services. Region for a deploy: `europe-west1` (Firestore, Functions and Storage).

> **The `spendingByMonth` composite index is only confirmed on a real deploy.** The dashboard's spending query (`splitUserIds` array-contains, ordered by `createdAt`) needs the index in [firestore.indexes.json](firestore.indexes.json). The emulator runs any query without indexes, so the tests can't prove the index is right. Until it has been deployed and the chart has loaded once against real Firestore, treat it as untested.

## Setup from a clean Windows machine

PowerShell, one command per line.

1. **Node 22 or newer**, from https://nodejs.org (the LTS installer). Then turn on pnpm, which comes with Node:

   ```powershell
   corepack enable pnpm
   ```

2. **Java 21**, which the Firestore and Storage emulators need. Install it from https://adoptium.net (Temurin 21) and tick "Set JAVA_HOME". Open a new terminal and check:

   ```powershell
   java -version
   ```

3. **Firebase CLI:**

   ```powershell
   npm install -g firebase-tools
   ```

   ```powershell
   firebase --version
   ```

   You don't need `firebase login` for the emulators, because `demo-` projects don't use an account. You will need it to deploy:

   ```powershell
   firebase login
   ```

4. **The project:**

   ```powershell
   pnpm install
   ```

   ```powershell
   Copy-Item .env.example .env.local
   ```

5. **Run it.** In one terminal, start the emulators. This builds the functions first. Wait for "All emulators ready".

   ```powershell
   pnpm emulators
   ```

   In a second terminal, add the demo data and start the app:

   ```powershell
   pnpm seed
   ```

   ```powershell
   pnpm dev
   ```

   The app is at http://localhost:5173 and the Emulator UI at http://127.0.0.1:4000. `pnpm seed` prints the demo logins.

> PowerShell tip: quote comma lists passed to the Firebase CLI, for example `firebase emulators:start --only "firestore,storage"`. Without quotes, PowerShell turns `firestore,storage` into an array.

## Environment variables

Vite reads `.env.local`, which git ignores. [.env.example](.env.example) has every variable, with values that work for the emulators.

| Variable                       | What it is                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `VITE_FIREBASE_PROJECT_ID`     | `demo-splitit` for the emulators, the real project id after deploy                     |
| `VITE_FIREBASE_API_KEY`        | Web API key from the Firebase console (any value works on the emulators)               |
| `VITE_FIREBASE_AUTH_DOMAIN`    | `<project>.firebaseapp.com`                                                            |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com`                                                                |
| `VITE_FIREBASE_APP_ID`         | Web app id from the Firebase console                                                   |
| `VITE_USE_EMULATORS`           | `true` to connect Auth, Firestore, Storage and Functions to the emulators on 127.0.0.1 |

These are the Firebase web config, which is public by design: it ships to every browser, and the security rules are what protect the data. **There is no service account key anywhere in this project, and there must never be one.** The functions use the Admin SDK's built-in credentials when deployed, and the emulator otherwise.

## Data model

![Data model](docs/data-model.png)

The full field list, and who can read and write each collection, is in [docs/data-model.md](docs/data-model.md) (diagram source: [docs/data-model.mmd](docs/data-model.mmd)).

In short:

- `users/{uid}`: your profile, readable only by you.
- `groups/{gid}`: name, currency, cover, `memberIds`, and `balances` (one integer per member, always summing to zero).
- `groups/{gid}/members/{uid}`: role, plus a copy of the member's name and photo so that group screens never read other people's profiles.
- `groups/{gid}/expenses/{eid}`: `amountMinor`, `paidBy`, `splits` (uid to minor units), `splitUserIds`.
- `groups/{gid}/payments/{pid}` and `groups/{gid}/activity/{aid}`: append-only.
- `invites/{token}`: the document id is the secret.

## How the security rules work

[firestore.rules](firestore.rules) and [storage.rules](storage.rules) follow one idea: **clients may read what belongs to groups they are in, and may write only their own profile.** Everything else is written by Cloud Functions through the Admin SDK, which skips the rules and does its own checks.

### Helpers

- `isSignedIn()`: there is a signed-in user.
- `isMember(gid)`: `groups/{gid}/members/{your uid}` exists. This costs one document read. The member document's id is the uid, so `exists()` is enough.
- `isOwner(gid)`: that member document says `role == 'owner'` (one `get()`).
- `isSelf(uid)`: the document is yours.

### Each rule in plain words

| Path                                    | Read                                        | Write                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                           | only you                                    | You create it once, on first sign-in, and its email and photo must match your sign-in. After that you can change only `defaultCurrency` and `weeklyReminders`. Never deleted. |
| `groups/{gid}`                          | if your uid is in its `memberIds`           | never (functions only)                                                                                                                                                        |
| `groups/{gid}/members/*`                | members                                     | never: a client could otherwise make itself owner                                                                                                                             |
| `groups/{gid}/expenses/*`, `payments/*` | members                                     | never                                                                                                                                                                         |
| `groups/{gid}/activity/*`               | members                                     | never                                                                                                                                                                         |
| `invites/{token}`                       | the group's owner (to list pending invites) | never. People holding a link call `invitePreview`, which returns only the group's name and the inviter's name.                                                                |
| anything else                           | no                                          | no                                                                                                                                                                            |
| Storage `receipts/{gid}/{eid}/*`        | members                                     | Members upload JPEG, PNG or WebP under 5 MB. Nobody deletes (functions do).                                                                                                   |
| Storage `covers/{gid}/*`                | members                                     | the owner; images under 5 MB                                                                                                                                                  |
| Storage `avatars/{uid}/*`               | anyone (so avatars load everywhere)         | only you; images under 5 MB                                                                                                                                                   |

Group reads check `memberIds` on the document instead of calling `isMember()`. The groups list runs `where('memberIds', 'array-contains', uid)`, and Firestore only allows a query if it can prove the rule from the query itself (decision log 4). A group that doesn't exist and a group you aren't in are both refused the same way, so the app can't tell them apart, and neither can an attacker.

### Why clients can't write money data

If the browser could write balances or expenses, any member could set their own debt to zero or invent an expense, and no rule can work out whether a split adds up correctly or whether a payment exceeds what is owed. So:

- every expense, edit, delete and payment is a callable function;
- the function re-checks membership;
- its zod schema validates the input;
- it changes the balances by the difference, in the same Firestore transaction as the change.

The rules then just say `allow write: if false`, which is easy to read and to test.

### Run the rule tests

```powershell
pnpm test:rules
```

This starts the Firestore and Storage emulators, runs 126 checks and prints a pass/fail table. Among other things, they check that:

- an outsider can't read or write anything in another group;
- even an owner can't write members, balances or expenses directly;
- uploads must be small raster images, so SVG is refused;
- signed-out visitors get nothing.

To try it by hand in the browser, see [DEMO.md](DEMO.md).

## Cloud Functions

All callable (`onCall`, 2nd gen, Node 22, `europe-west1`), in [functions/src](functions/src). Each one:

- requires sign-in;
- validates its input with a zod schema shared with the client forms ([functions/src/shared/schemas.ts](functions/src/shared/schemas.ts));
- re-checks membership with the Admin SDK;
- writes in a transaction, together with an activity entry.

| Function                                        | Does                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createGroup`, `updateGroup`                    | New group with you as owner. Rename it or change the cover; an old uploaded cover is deleted.                                                                                                                                     |
| `createInvite`, `invitePreview`, `acceptInvite` | A reusable link (7 days) or a personal invite for one email. The preview shows only the group name and inviter. Accepting adds you to the members and to `memberIds` together.                                                    |
| `leaveGroup`, `removeMember`                    | Only with a zero balance. The last member to leave deletes the group.                                                                                                                                                             |
| `saveExpense`, `deleteExpense`                  | Splits must add up to the amount exactly, in integer minor units. Only the person who added the expense can change it. Balances move by the difference. Expenses involving someone who has left are frozen.                       |
| `recordPayment`                                 | Only the payer or receiver can record it. Inside the transaction, the amount is capped at the smaller of what the payer owes and what the receiver is owed, so two payments at the same moment can't overpay (tested with races). |
| `settleUp`                                      | Works out the plan (see below). Reads only.                                                                                                                                                                                       |
| `recomputeBalances`                             | Owner only. Rebuilds balances from every expense and payment, and corrects them if they differ.                                                                                                                                   |
| `spendingByMonth`                               | Your share (`splits[you]`) of expenses per month, per currency, in your time zone. Needs the composite index (see above).                                                                                                         |
| `updateProfile`                                 | Name and photo: updates `users/{uid}` and the copy on every `members` document, in batches. Deletes the old photo.                                                                                                                |

## Settle-up

Each group's balances are integers that add up to zero. The settle-up plan is worked out by the `settleUp` function; the browser only shows it. It is greedy: match whoever is owed the most with whoever owes the most, for the smaller of the two amounts, and repeat. Each payment clears at least one person, so n people need at most n − 1 payments. Ties are broken by uid, so everyone sees the same plan.

Finding the truly fewest payments is NP-hard: it means finding groups of people whose balances cancel out among themselves, which is a subset-sum problem. Greedy is fast, never needs more than n − 1 payments, and for real groups is usually optimal or one payment off.

The tests check that:

- the payments bring every balance to zero;
- every amount is a positive integer;
- there are at most n − 1 payments;
- ties give the same plan;
- people who have left are excluded.

Payments can be partial. They are pooled per person, so the limit is "what you owe overall", not "what you owe Ada" (see limitations).

## Realtime design

- **An open group has four `onSnapshot` listeners:** the group document (balances, members, name), its expenses, its payments and its activity, newest first and limited to 500, 500 and 50. They write straight into TanStack Query's cache, so every part of the page updates together.
- **No duplicate listeners.** A small reference-counted registry ([src/live/registry.ts](src/live/registry.ts)) starts a group's listeners once, however many components need them, and stops them when you leave the group's pages. In development, `window.__splitit.openListeners()` reports how many are open.
- **What you see.** New rows get a highlighter sweep. When someone else changes something, a short note names them. When balances change, the settle-up plan is fetched again.
- **Losing access.** If you are removed, or the group is deleted, while the page is open, the listeners are refused with `permission-denied`. The page then switches to "You're not in this group any more." instead of breaking.
- **Search (Ctrl+K or ⌘K) is client-side.** Firestore has no substring search, so the search box loads your groups and each one's latest 500 expenses into the browser and matches there, ignoring case and accents. It can only find what you can already read.
- **Offline.** A bar says when the browser is offline. Firestore keeps showing what it already loaded, but nothing can be saved, because every change goes through a function. The listeners catch up when the connection returns.

## The app, screen by screen

- **Sign-in:** email and password, or Google. Google uses a popup on desktop and a full-page redirect on touch screens. Signed-out visitors are sent to `/auth?next=…` and come back to where they were heading; `next` only accepts paths inside the app.
- **Dashboard:**
  - Tiles for what you owe, what you're owed and your net balance, one line per currency, never added across currencies.
  - Your spending per month.
  - Quick actions and your groups.
- **Group:**
  - The ledger, with each row showing your share.
  - Where everyone stands, and the settle-up plan.
  - Recent activity and the member list.
  - Invites, cover photo, and leave or remove members.
- **Settle up:** one card per payment, with "Record payment" (if you pay) or "Mark as received" (if you're paid) for a full or partial payment.
- **Activity:** a timeline of all your groups, filterable.
- **Settings:**
  - Name and photo, which go through `updateProfile`.
  - Reminder setting, theme, default currency and log out.
  - Avatars show your uploaded photo, then your Google photo, then an illustration chosen by a hash of your uid.

**Accessibility and polish:**

- Every dialog traps focus, closes on Esc and puts focus back on the button that opened it.
- There is a skip link, and every screen works by keyboard.
- Reduced-motion settings turn the animations off.
- Every screen has a dark theme, which follows the system until you choose one.
- Loading shows skeletons, failures show "Try again", and empty lists say what to do next.

**Bundle:** each signed-in screen is loaded the first time it's opened, and the big libraries (Firestore, Firebase, React, TanStack Query) get their own files. No file is over Vite's 500 kB warning.

## Tests

| Command               | What it proves                                                                                                                                                                                                                                                                                           | Needs                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm test`           | Unit and component tests: money parsing, formatting and equal splits, balance arithmetic (with a 500-step random check), settle-up, chart scale, search, image checks. Components in jsdom: the route guard, the money input and the expense form's split totals.                                        | nothing                                       |
| `pnpm test:rules`     | 126 checks on `firestore.rules` and `storage.rules` (see above)                                                                                                                                                                                                                                          | Java (starts Firestore and Storage emulators) |
| `pnpm test:functions` | Every callable, called through the client SDK, covering profile, groups, invites, membership, expenses (balances rebuilt from raw expenses after every change), payments (overpaying refused even when payments race), and `spendingByMonth` (my share only, yen, several currencies, edits and deletes) | Java (starts all emulators)                   |

The emulator suites start and stop their own emulators and print a pass/fail table. Stop `pnpm emulators` first, because the ports clash.

## Scripts

| Command          | What it does                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Vite dev server                                                                                                                             |
| `pnpm build`     | Typecheck and build to `dist/`                                                                                                              |
| `pnpm typecheck` | TypeScript for the app, tests and `functions/`                                                                                              |
| `pnpm lint`      | ESLint (type-aware)                                                                                                                         |
| `pnpm format`    | Prettier                                                                                                                                    |
| `pnpm emulators` | Build the functions and start all emulators                                                                                                 |
| `pnpm seed`      | Wipe the emulators and create 3 people and 2 groups (NGN and JPY) through the real functions. Refuses anything but local `demo-` emulators. |
| `pnpm diagram`   | Re-render `docs/data-model.png` from `docs/data-model.mmd` (uses your installed Chrome)                                                     |

### Before deploying: authorised domains

Google sign-in only works on domains listed in Firebase. Once the Vercel site exists, add its domain under **Authentication → Settings → Authorized domains** (decision log 11).

## Known limitations

- **The `spendingByMonth` composite index is unconfirmed until a real deploy** (see [What runs where](#what-runs-where)).
- **Expenses involving someone who left are frozen.** You can only leave with a zero balance, but your name stays on old expenses. Editing or deleting one would give you a balance after you'd gone, with no way to settle it, so both are refused, and the ledger says why. To change one, that person has to rejoin first.
- **A receipt can be left behind in Storage.** The photo is uploaded before the expense is saved, and the save checks that it exists. If the upload works but the save fails, the photo stays with nothing pointing to it. Clients can't delete receipts, so cleaning these up would need a scheduled function. Replacing or removing a receipt through the app does delete the old file.
- **Payments are pooled per person.** "What Bayo owes Ada" isn't stored. The limit for a payment is the smaller of what the payer owes and what the receiver is owed overall.
- **Settle-up is greedy**, not guaranteed minimal (see above).
- **No email is sent** for invites. You send the link yourself.
- **Long histories are cut off.**
  - The ledger shows a group's latest 500 expenses and 500 payments, so in a big group its "Total spent" covers only those.
  - Balances are always complete, because they're stored, not added up in the browser.
  - The Activity page shows the latest 50 entries per group.
- **The spending chart uses the date an expense was added**, because there is no separate "date spent".
- **Search only covers what is loaded:** your groups and their latest 500 expenses each.
- **Offline, nothing can be saved.** The app says so, rather than queueing changes.

## Docs

- [DEMO.md](DEMO.md): run it locally and try to read another group's data
- [Data model and access table](docs/data-model.md)
- [Decision log](docs/decision-log.md)
- Rules: [firestore.rules](firestore.rules), [storage.rules](storage.rules)
