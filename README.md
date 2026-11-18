# SplitIt

A shared expense splitter: groups, expenses, balances and settle-up, built on Firebase.

> **Status: Phase 3 (groups, invites, join flow).** Expenses arrive in Phase 4.

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

## Tests

| Command               | What it proves                                                                                                                                                                                                                                                                       | Needs                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `pnpm test`           | Unit and component tests: money limits and formatting, batch splitting, image checks, the route guard (jsdom), and that the two copies of `money.ts` are identical                                                                                                                   | nothing                                       |
| `pnpm test:rules`     | 126 checks on `firestore.rules` and `storage.rules`. An outsider (B) can't read or write anything in A's group, including members, expenses, payments, activity, invites, receipts and A's profile. Even the owner can't write money data directly. Signed-out visitors get nothing. | Java (starts Firestore and Storage emulators) |
| `pnpm test:functions` | Every callable, called through the client SDK: `updateProfile`, `createGroup`, `updateGroup`, `createInvite`, `invitePreview`, `acceptInvite`, `leaveGroup`, `removeMember` (input validation, auth, membership, and what each one writes)                                           | Java (starts all emulators)                   |

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

## Docs

- [Data model and access table](docs/data-model.md)
- [Decision log](docs/decision-log.md)
- Rules: [firestore.rules](firestore.rules), [storage.rules](storage.rules)
