# SplitIt

A shared expense splitter: groups, expenses, balances and settle-up, built on Firebase.

> **Status: Phase 5 (balances, settle-up, payments).** Realtime, activity and search arrive in Phase 6.

## What runs where

The project is on the free Spark plan, with no Blaze (billing) plan. Blaze will be reconsidered at deploy time. Until then:

| Part                                      | Where it runs                                                |
| ----------------------------------------- | ------------------------------------------------------------ |
| Frontend (React)                          | Deployed to Vercel (from Phase 8)                            |
| Cloud Functions (all money logic)         | **Emulator only** (needs Blaze to deploy)                    |
| Cloud Storage (receipts, avatars, covers) | **Emulator only** (Spark has no Storage)                     |
| Firestore and its security rules          | **Emulator only** (deployable to a free Spark project later) |
| Authentication                            | **Emulator only**                                            |

The Firebase project id is `demo-splitit`. Ids that start with `demo-` only work with the emulators and can never reach real cloud services. Region (for a future deploy): `europe-west1`.

## Setup on Windows (PowerShell)

You need Node 22 or newer, pnpm, Java 21 (for the Firestore emulator) and the Firebase CLI.

```powershell
node --version
pnpm --version
java -version
npm install -g firebase-tools
pnpm install
Copy-Item .env.example .env.local
```

Run the emulators in one terminal and the app in another:

```powershell
pnpm emulators
```

```powershell
pnpm dev
```

The Emulator UI is at http://127.0.0.1:4000.

> PowerShell tip: quote comma lists passed to the Firebase CLI, for example `firebase emulators:start --only "firestore,storage"`. Without quotes, PowerShell turns `firestore,storage` into an array.

## Sign-in and routes

- Email and password, plus Google. Google opens a popup on desktop and a full-page redirect on touch screens (or when the popup is blocked). With the emulators, Google sign-in shows the Auth emulator's fake account picker.
- On first sign-in the app creates `users/{uid}` itself. The rules check that the email and photo match the sign-in.
- Routes: `/` landing, `/auth`, `/app` (dashboard), `/app/groups`, `/app/groups/:id`, `/app/groups/:id/settle`, `/app/activity`, `/app/settings`, `/join/:token`. Everything under `/app` and `/join` needs sign-in. A signed-out visitor is sent to `/auth?next=…` and comes back to the same page afterwards. `next` only accepts paths inside the app, so it can't send anyone to another site.
- A group you are not in, and a group that doesn't exist, both show "You're not in this group." Firestore answers `permission-denied` in both cases, so the app can't tell them apart either.

### Before deploying: authorised domains

Google sign-in only works on domains listed in Firebase. When the Vercel site exists (Phase 8), add its domain in the Firebase console: **Authentication → Settings → Authorized domains → Add domain** (for example `splitit.vercel.app`). See decision log entry 11 for the redirect flow on Safari.

## Groups and invites

- **Create a group** with a name, a currency (fixed once the first expense is added) and an illustrated cover or your own photo. Photos are shrunk in the browser to at most 1600px JPEG before upload.
- **Invite** with the group's link (reusable for 7 days; the same link is handed out while it has more than a day left) or with a personal invite for one email address (works once, only for that address). SplitIt doesn't send emails yet, so you send the link yourself. Any member can invite; only the owner sees the pending list.
- **Join** at `/join/:token`. Before joining you see only the group's name and who invited you. The screen also handles expired, used, wrong-email, full and already-a-member links.
- **Leave or remove** someone only when their balance is zero. Their name stays on old expenses. The last member leaving deletes the group.
- A group has at most 50 members.

## Expenses

- **Add or edit** with a title, an amount, who paid, and who it was for, split equally or in custom amounts that must add up to the total. In an equal split that doesn't divide evenly, the odd kobo (or cent, or yen) goes to the first names in the list, so the shares always add up to the total.
- **Money is parsed from text to whole minor units without floats** (`src/lib/money.ts`): `1,250.50` is 125050 kobo, yen takes no decimals, and wrong grouping, too many decimals, zero and absurd amounts are refused with a sentence that says what to fix.
- **Only the person who added an expense can edit or delete it.** Others see "Only Ada can edit or delete this." Expenses involving someone who has left can't be changed at all.
- **Receipts** are resized in the browser to at most 1600px JPEG, uploaded to `receipts/{group}/{expense}/` (members only), and opened from the camera icon in the ledger.
- **Balances** are kept on the group by `saveExpense` and `deleteExpense`, in the same transaction as the expense.

## Balances, settle-up and payments

- **Balances** live on the group: one integer per member, in minor units, always adding up to zero. Only `saveExpense`, `deleteExpense` and `recordPayment` change them, each in the same transaction as the change itself.
- **Settle-up** is worked out by the `settleUp` function; the browser only displays the result. It uses the greedy "largest creditor pays largest debtor" method: match whoever is owed the most with whoever owes the most, for the smaller of the two amounts, and repeat. Each payment clears at least one person, so a group of n people needs at most n − 1 payments. Ties are broken by uid, so everyone sees the same plan.
- **Why greedy?** Finding the truly fewest payments is NP-hard: it means finding groups of people whose balances cancel out among themselves (a subset-sum problem), and the work grows exponentially with the group. Greedy is fast, never worse than n − 1, and for real groups usually optimal or one payment away.
- **Payments** can be full or partial. Only the payer or the receiver can record one, it can never be more than is owed at that moment, and it can't be edited or deleted afterwards.
- **`recomputeBalances`** (owner only) rebuilds the balances from every expense and payment and corrects them if they ever differ. The tests check it matches after a mix of expenses, edits, deletes and payments.

## Tests

| Command               | What it proves                                                                                                                                                                                                                                                                                                 | Needs                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm test`           | Unit and component tests: money parsing, formatting and equal splits, balance arithmetic (with a 500-step random check), image checks, and components in jsdom: the route guard, the money input and the expense form's split totals                                                                           | nothing                                       |
| `pnpm test:rules`     | 126 checks on `firestore.rules` and `storage.rules`. An outsider (B) can't read or write anything in A's group, including members, expenses, payments, activity, invites, receipts and A's profile. Even the owner can't write money data directly. Signed-out visitors get nothing.                           | Java (starts Firestore and Storage emulators) |
| `pnpm test:functions` | Every callable, called through the client SDK: profile, groups, invites, membership, expenses (balances rebuilt from raw expenses after every change), and payments (overpaying refused even when two payments race; settle-up plans; people who left excluded; `recomputeBalances` after a mix of everything) | Java (starts all emulators)                   |

Both emulator suites start and stop the emulators themselves and print a pass/fail table at the end. Don't run them while `pnpm emulators` is already running: the ports clash.

## Scripts

| Command          | What it does                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Vite dev server                                                                                                                           |
| `pnpm build`     | Typecheck and build to `dist/`                                                                                                            |
| `pnpm typecheck` | TypeScript for the app, tests and `functions/`                                                                                            |
| `pnpm lint`      | ESLint (type-aware)                                                                                                                       |
| `pnpm format`    | Prettier                                                                                                                                  |
| `pnpm emulators` | Build the functions and start all emulators                                                                                               |
| `pnpm diagram`   | Re-render `docs/data-model.png` from `docs/data-model.mmd` (uses your installed Chrome; edit `docs/puppeteer.json` if it lives elsewhere) |

## Known limitations

- **Expenses involving someone who left are frozen.** You can only leave a group with a zero balance, but your name stays on old expenses. Editing or deleting one of those would give you a balance again after you'd gone, with no way to settle it, so both are refused and the ledger says why ("Bayo has left the group, so this can no longer be changed."). To change one, the person has to rejoin first.
- **A receipt can be left behind in Storage.** To attach a receipt, the photo is uploaded before the expense is saved (the save checks it exists). If the upload works but the save then fails, the photo stays in `receipts/{group}/{expense}/` with nothing pointing to it. The rules don't let clients delete receipts, so cleaning these up would need a scheduled function. Replacing, removing or deleting a receipt through the app does delete the old file.
- **Payments are pooled per person.** "What Bayo owes Ada" isn't stored; the limit for a payment is the smaller of what the payer owes and what the receiver is owed overall.
- **Settle-up is greedy**, not guaranteed minimal (see above).
- **No email is sent** for invites yet. You send the personal link yourself.

## Docs

- [Data model and access table](docs/data-model.md)
- [Decision log](docs/decision-log.md)
- Rules: [firestore.rules](firestore.rules), [storage.rules](storage.rules)
