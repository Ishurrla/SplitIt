# SplitIt

A shared expense splitter: groups, expenses, balances and settle-up, built on Firebase.

> **Status: Phase 0 (setup and data model review).** The app itself arrives in Phase 2.

## What runs where

This project has no Firebase Blaze plan, so:

| Part                                      | Where it runs                                                |
| ----------------------------------------- | ------------------------------------------------------------ |
| Frontend (React)                          | Deployed to Vercel (from Phase 8)                            |
| Cloud Functions (all money logic)         | **Emulator only**                                            |
| Cloud Storage (receipts, avatars, covers) | **Emulator only**                                            |
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

## Scripts

| Command          | What it does                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Vite dev server                                                                                                                           |
| `pnpm build`     | Typecheck and build to `dist/`                                                                                                            |
| `pnpm typecheck` | TypeScript for the app and `functions/`                                                                                                   |
| `pnpm lint`      | ESLint (type-aware)                                                                                                                       |
| `pnpm format`    | Prettier                                                                                                                                  |
| `pnpm test`      | Vitest unit tests                                                                                                                         |
| `pnpm emulators` | Start all emulators                                                                                                                       |
| `pnpm diagram`   | Re-render `docs/data-model.png` from `docs/data-model.mmd` (uses your installed Chrome; edit `docs/puppeteer.json` if it lives elsewhere) |

## Docs

- [Data model and access table](docs/data-model.md)
- [Decision log](docs/decision-log.md)
- Draft rules: [firestore.rules](firestore.rules), [storage.rules](storage.rules)
