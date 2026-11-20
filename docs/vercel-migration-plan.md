# Plan: the full app live on Spark + Vercel

Status: **approved and implemented** (decision log 34). Differences from this plan: the rate limit defaults to 120 calls a minute rather than 60, and Node is pinned to 24.x. `vercel build` ran locally without a login, and its function output was tested against the emulators (decision log 34).

## Goal

The full app goes live with no Blaze plan:

- **Firebase (Spark):** Auth (email and Google), Firestore, and the Firestore rules and indexes.
- **Vercel:** the frontend, plus the 14 callables rewritten as Vercel serverless functions.

The behaviour, the security model and what the tests prove all stay the same. Storage (receipts, covers, avatars) stays emulator-only.

## 1. Architecture

### Server code moves from `functions/` to `server/`

I'll use `git mv` so each file keeps its history. The handler bodies stay almost exactly as they are now.

```
server/
  shared/schemas.ts      zod schemas + result types (the client imports these, as today)
  lib/                   money, balances, settle, spending, chunks, groups (+ their unit tests)
  lib/errors.ts          ApiError(code, message): replaces firebase-functions' HttpsError
  lib/request.ts         requireAuth / parseInput, unchanged logic
  admin.ts               initialises firebase-admin once per instance (credentials, see §3)
  handlers/              createGroup, updateGroup, invites, members, expenses, payments,
                         spendingByMonth, updateProfile: today's callable bodies
  handlers/index.ts      { name → handler } map of the 14 handlers
  http/handle.ts         handleApi(name, Request) → Response: the one place that does transport
  http/node.ts           a small Node http adapter (local dev and tests), ~40 lines
api/
  [name].ts              Vercel entry: export POST/GET/... → handleApi(name, request)
```

### One Vercel function instead of 14

The brief suggests `/api/<name>.ts`, one file per callable. That would make 14 functions. Vercel's Hobby plan rejects a deployment with more than 12 serverless functions when there's no framework that bundles routes. I found this in a [community report of the error](https://community.vercel.com/t/vercel-deployment-fails-with-12-serverless-functions-limit-error-despite-having-11-functions/35397). The [official limits page](https://vercel.com/docs/limits/overview) only says "Framework-dependent".

So I'll use **one dynamic route, `api/[name].ts`**. The URLs are still `/api/createGroup`, `/api/recordPayment` and so on, and each handler is still its own module in `server/handlers/`. One function also means fewer cold starts.

### What a handler looks like

Each handler keeps the callable's shape. `onCall(callableOptions, async (request) => …)` becomes `defineHandler(async (request) => …)`, where `request` is `{ auth?: { uid, token }, data }`. That is the same shape as `CallableRequest`. The code inside stays the same:

- It starts with `requireAuth(request)`.
- It runs `parseInput(schema, request.data)` with the same zod schemas.
- It runs the same `runTransaction` with the same membership and ownership checks (`readMembership`, `notAMember`, the owner checks).
- It returns the same results.

### What `handleApi` does, in order

1. **Method.** Only POST is accepted; anything else gets 405.
2. **Name.** An unknown name gets 404 `not-found`.
3. **Content type.** Must be `application/json`.
4. **Size.** A body over **32 KB** gets 413 and `invalid-argument`, before it is parsed. The largest real input is a saveExpense with every member's split, which is about 2 KB.
5. **Token.** It reads `Authorization: Bearer <ID token>` and runs `getAuth().verifyIdToken(token)`.
   - With no header, `request.auth` is undefined, so the handler's own `requireAuth` answers `unauthenticated`, exactly as now.
   - A header that is present but invalid or expired gets `unauthenticated` straight away.
   - `verifyIdToken` also checks the token's project (`aud`), so a token from another Firebase project fails.
6. **Body.** The body is `{ data }`, as in the callable protocol.
7. **Response.**
   - **Success:** `200 { result }`.
   - **ApiError:** `{ error: { code, message } }` with the HTTP status the callables used. For example `permission-denied` is 403, `not-found` 404, `invalid-argument` 400, `failed-precondition` 400, `unauthenticated` 401.
   - **Any other error:** logged on the server and returned as `500 { error: { code: 'internal', message: 'Internal error' } }`. No details leak; callables behave the same way.

### Client side

`src/lib/callables.ts` keeps its exported functions, with the same names and the same types. Only the body of `callable(name)` changes, to a fetch wrapper:

- It gets the token from `auth.currentUser?.getIdToken()`; the SDK refreshes it when it's close to expiring.
- It sends `POST /api/<name>` with `{ data }`.
- On an error answer it throws `{ code: 'functions/<code>', message }`.
- A network failure (fetch throws) becomes `functions/unavailable`. A reply that isn't JSON becomes `functions/internal`.

So `callableErrorMessage`, `isConnectionError` and every screen keep working without changes. `firebase/functions` leaves the client bundle.

## 2. Local development

**Handlers run inside the Vite dev server.** A small Vite plugin (dev only, `configureServer`) sends `/api/*` to `server/http/node.ts`. That loads the handlers through `server.ssrLoadModule`, so server code reloads on save. The result:

- `pnpm dev` serves the app and the API on the same origin, `http://localhost:5173`, just like Vercel.
- There's no second process and no Vercel login.

Before loading the server code, the plugin sets the Admin SDK's emulator variables from `.env.local`: `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` and `GCLOUD_PROJECT=demo-splitit`.

**Why not `vercel dev`:** it needs a Vercel login and a linked project, and it runs Vite itself. That adds a cloud dependency to the local demo and is unreliable on Windows with pnpm. The handler code is the same either way; only the 10-line entry file `api/[name].ts` differs. I'll also try `vercel build` locally to check that Vercel bundles `api/[name].ts`. If that needs a linked project, I'll say so and your first deploy becomes that check.

**The emulators:** `pnpm emulators` starts auth, firestore, storage and the UI. The functions emulator and the build-functions step go away.

**`pnpm seed`:** it calls `http://localhost:5173/api/*` with each person's ID token. So it uses the real HTTP path, as it uses the real callables today. It needs `pnpm dev` running, so DEMO.md's order becomes emulators → dev → seed. "Wait for the functions to load" becomes "wait for /api to answer". The wipe step, the data and the printed tables stay the same.

**`pnpm demo`:** it already requires the emulators and `pnpm dev`. Its port check drops 5001; nothing else changes. The DevTools snippets in DEMO.md stay the same, because they test the rules, which are unchanged.

## 3. Security

**Rules.** `firestore.rules` is not changed. Clients still can't write `groups`, `members`, `expenses`, `payments`, `activity` or `invites`. The 126 rules tests run as they are. `storage.rules` stays for the emulator.

**Explicit checks.** The Admin SDK bypasses the rules, so every check stays explicit in each handler: auth, membership, owner-only actions, "only edit your own expense", and payment limits. These are the same lines of code as now, just moved. The tests in §6 make an outsider, a signed-out caller and a non-owner call every handler again.

**Credentials:**

- **One Vercel environment variable:** `FIREBASE_SERVICE_ACCOUNT`, the service-account JSON encoded as base64. I chose base64 because private-key newlines are often mangled when pasted into env vars.
- **Where it's set:** Production only, as a sensitive variable.
- **Never in git or client code:** the key never goes in git, the client, or any `VITE_*` variable. `.env.example` lists the names with empty values.
- **Local key file:** your PowerShell steps delete it after upload.

**Server start-up guards.** `server/admin.ts` refuses to start when:

- `VERCEL_ENV` is set and any `*_EMULATOR_HOST` variable is set too;
- there's neither a service account nor the emulators;
- the emulator project id doesn't start with `demo-`.

**CORS.** `/api` is on the same origin, so I'll set no CORS headers and preflight requests are refused. Auth is a bearer token rather than a cookie, so a cross-site form post carries no identity, which means no CSRF.

**Abuse protection:**

- **Request limits:** the 32 KB body cap, POST and JSON only, and the existing zod `max()` limits on every field.
- **Per-uid rate limit:** about 60 calls a minute in each function instance's memory, answered with `resource-exhausted` (429). This is best effort, because instances don't share memory. A shared limiter would need a store such as Redis, which is a new service, so I'm leaving it out.
- **The real backstop is Spark's free quota.** Someone abusing the API could use up the day's free writes (20k). Firestore would then refuse writes until the daily reset. Spark has no billing, so the risk is the app going down for the day, not a bill. I'll write this in the README's Known limitations.
- **Invite tokens** stay 128 random bits.

## 4. Firebase project on Spark

All of this works on Spark with the CLI and the console:

- `firebase projects:create`
- `firebase apps:create web` and `apps:sdkconfig` for the `VITE_FIREBASE_*` values
- `firebase firestore:databases:create`
- `firebase deploy --only firestore:rules,firestore:indexes`

Turning on the email and Google providers, generating the service-account key and adding authorised domains are console steps, and I'll give them as console instructions.

**Firestore location: your decision, needed before you create the database. It can't be changed later.** The functions now run on Vercel, so the location only needs to sit close to the Vercel function region. Each handler makes several Firestore round trips, and that distance matters most:

| Firestore             | Vercel region      | Notes                                                        |
| --------------------- | ------------------ | ------------------------------------------------------------ |
| `europe-west3`        | `fra1` (Frankfurt) | **Recommended:** same city, lowest latency per round trip    |
| `europe-west1`        | `cdg1` (Paris)     | Matches the Phase 0 region choice; about 300 km apart        |
| `eur3` (multi-region) | `fra1`             | Higher availability, slightly slower writes; same free quota |

I'll set it with `"regions"` in `vercel.json`. The Hobby plan allows one region. The code's `REGION` constant only applied to Cloud Functions, so it goes away.

**Index.** The spendingByMonth composite index on `expenses` (`splitUserIds` CONTAINS, `createdAt` ASC) is deployed from `firestore.indexes.json`. The live end-to-end test opens the dashboard chart, so this will be the first real check of that index.

**Google sign-in on the Vercel domain.** Desktop uses a popup and phones use a redirect. A redirect through `<project>.firebaseapp.com` breaks in browsers that block third-party storage (Safari, and Chrome with that setting). Firebase's recommended fix:

- Add a Vercel rewrite `/__/auth/:path*` → `https://<project>.firebaseapp.com/__/auth/:path*`.
- Set `VITE_FIREBASE_AUTH_DOMAIN` to the Vercel domain.
- Add `https://<vercel-domain>/__/auth/handler` as an authorised redirect URI on the OAuth client.

That rewrite needs the project id, so I'll add it once you've created the project. **I cannot test this redirect**; you'll test it on a phone.

## 5. Storage on the live site, and the honest note

**Separate flags for client and server.**

- **Client:** `VITE_STORAGE_UPLOADS=true|false`. `.env.example` sets `true` for the emulators. It's unset in Vercel, so it defaults to `false`. When false:
  - the receipt picker (ExpenseForm/ExpenseModal), the cover upload (NewGroupModal, GroupView) and the avatar upload (SettingsPage) are hidden, each with a one-line note: "Photo uploads only work in the local emulator version (Firebase Storage needs the paid plan)."
  - `useStorageUrl` and `publicStorageUrl` are never called. Covers use the illustrated set, and avatars use initials or the Google profile photo, which is a Google URL, not Storage.
  - `firebase/storage` is only loaded by the upload components, so it isn't even downloaded.
- **Server:** Storage is on only when `FIREBASE_STORAGE_EMULATOR_HOST` is set. When it's off:
  - **Non-null paths are refused:** a non-null `receiptPath`, `coverPath` or `photoPath` gets `failed-precondition` "Photo uploads aren't available on this site."
  - **No file cleanup:** the cleanup in deleteExpense, leaveGroup (when the group is deleted) and updateGroup is skipped.

  So no Storage call is ever made in live mode.

- **Test:** "live mode" can be tested locally by turning both flags off against the emulators. I'll check the network log for zero requests to port 9199.

**The preview mode goes.** I'll delete the site mode: `PreviewSite.tsx`, `site.ts`, the `SiteNotice` and `previewRoutes` in the router, `build:site`, and the `VITE_README_URL` check in `vite.config.ts`. The real `VITE_FIREBASE_*` web config comes from Vercel env vars; this config is public and fine in the client.

**The honest note.** It's one line on the landing page footer and in Settings: "Receipts and photo uploads run only in the local emulator version, and the weekly reminder email isn't built yet." It links to the README.

## 6. `functions/`, the emulator and the 102 tests

**Folder and package:**

- `functions/` is moved (not copied) to `server/`, then deleted.
- `firebase-functions` is removed.
- `firebase.json` loses its `functions` block and the functions emulator.
- `pnpm-workspace.yaml` drops the `functions` package; `firebase-admin` and `zod` move to the root `package.json`.

**Tests:**

- **Moved to `tests/api/`, test bodies unchanged:** the 102 function tests move from `tests/functions/` to `tests/api/`, and `pnpm test:functions` becomes `pnpm test:api`.
- **What changes is `harness.ts`.** `client().call(name, data)` now does a fetch to the API with the client's ID token, through the same wrapper the app uses. `expectCode` still checks `functions/<code>`.
- **How they run:** `firebase emulators:exec --only auth,firestore,storage`. A Vitest `globalSetup` starts two instances of `server/http/node.ts`: one on port 5002 with Storage on, and one on port 5003 with Storage off.
- **New tests:**
  - **Transport:** wrong method → 405, unknown name → 404, oversized body → 413, non-JSON body.
  - **Tokens:** a garbage token, an expired token, or a token for another project → `unauthenticated`.
  - **Rate limit:** going over it → `resource-exhausted`.
  - **Storage off:** paths are refused and cleanup is skipped.
- **The race tests** ("cannot overpay … several times at once", "two payments at the same moment", "partial payments racing") stay as they are.
  - Today they cross the functions emulator. Now they cross a Node server that handles requests at the same time, so they overlap more, not less.
  - The Admin SDK retries a contended transaction up to 5 times. If that turns out to give `aborted` instead of `failed-precondition` under load, I'll report it to you rather than loosen the assertion.
- **Transaction mutation check, repeated:** I'll temporarily replace recordPayment's `runTransaction` with plain reads and writes. I'll confirm the race tests fail, restore it, confirm they pass, and record both runs in the decision log.
- **The money-sync unit test** (server `money.ts` equals client `money.ts`) moves with `lib/`. Unit tests become `src/**` + `server/**`.

## 7. Files changed

**Moved (git mv):**

- `functions/src/**` → `server/**`
- `tests/functions/**` → `tests/api/**`
- `vitest.functions.config.ts` → `vitest.api.config.ts`

**New:**

- `server/lib/errors.ts`, `server/lib/request.ts` (from `callable.ts`), `server/admin.ts`
- `server/handlers/index.ts`, `server/http/handle.ts`, `server/http/node.ts`
- `api/[name].ts`, `tsconfig.server.json`
- `tests/api/globalSetup.ts`, `tests/api/transport.test.ts`, `tests/api/storageOff.test.ts`

**Edited, server side:**

- Every handler file: `onCall` → `defineHandler`, `HttpsError` → `ApiError`, `logger` → a console logger, and the Storage guard in expenses, members and updateGroup.
- `server/shared/schemas.ts`: import paths only.

**Edited, client side:**

- `src/lib/callables.ts` (fetch wrapper)
- `src/lib/firebaseServices.ts` (Storage only, no Functions)
- `src/lib/firebase.ts` (drop the preview mode, add `STORAGE_UPLOADS`)
- `src/vite-env.d.ts`, `src/main.tsx`, `src/app/router.tsx`
- `src/groups/queries.ts`, `src/lib/storageUrl.ts`, `src/ui/Avatar.tsx`, `src/groups/Cover.tsx`
- `src/expenses/ExpenseForm.tsx` (and its test), `src/expenses/ExpenseModal.tsx`, `src/expenses/Ledger.tsx`
- `src/groups/NewGroupModal.tsx`, `src/groups/GroupView.tsx`, `src/settings/SettingsPage.tsx`
- `src/pages/LandingPage.tsx`

**Deleted:**

- `src/pages/PreviewSite.tsx`, `src/lib/site.ts`
- `functions/package.json`, `functions/tsconfig*.json`, `functions/src/index.ts`, `functions/src/lib/options.ts`

**Config:**

- `package.json` (deps, scripts), `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `firebase.json`, `vite.config.ts` (the dev API plugin; no site check), `vitest.config.ts`
- `tsconfig.json`, `tests/tsconfig.json`, `eslint.config.js`
- `vercel.json`: build `pnpm build`, region, a SPA rewrite that excludes `/api/`, and later the `/__/auth` rewrite
- `.env.example`, `.vercelignore`

**Scripts and docs:**

- `scripts/seed.mjs`, `scripts/demo-walkthrough.ps1`
- `README.md`, `DEMO.md`, `docs/decision-log.md`, and `docs/data-model.md` if it names functions

## 8. Order of work, and how I'll verify each step

1. **Move and rename, no behaviour change.**
   - Work: `git mv`, ApiError/defineHandler, `handleApi`, the Node adapter, globalSetup, the new harness.
   - Check: typecheck, then all 102 tests passing over HTTP. This proves the move kept the behaviour before anything else changes.
2. **Transport and token tests, and the rate limit.**
   - Check: the new tests pass, and the full API suite passes again.
3. **Race and mutation check.**
   - Check: the race tests pass three runs in a row, fail with the transaction removed, and pass again once it's restored.
4. **Client wrapper and the dev plugin.**
   - Check: unit tests. Then `pnpm emulators` + `pnpm dev` + `pnpm seed` gives the same balances as today (Lekki Ada 6,244,141 / Bayo −3,333,333 / Chi −2,910,808; Tokyo ±37,324). Then in the browser:
     - sign in;
     - add an expense, record a payment, use an invite, view the dashboard chart;
     - try an outsider's Tokyo link;
     - run the DevTools snippets;
     - show an error message (permission-denied, and the server stopped → "Couldn't reach the server").
5. **Storage off.**
   - Check: the storageOff tests pass. In the browser with both flags off: the uploads are hidden with the note, and the network log shows no requests to port 9199.
6. **Remove the preview mode, functions/ and the functions emulator.**
   - Check: `pnpm install` works with the new lockfile; `pnpm build` passes with no chunk warning; `vercel build` runs locally if it can without a linked project.
7. **Scripts.**
   - Check: `pnpm demo` runs through with `-NoPause -NoBrowser`.
8. **All checks.**
   - Commands: format:check, typecheck, lint, build, `pnpm test`, `pnpm test:rules`, `pnpm test:api`.
   - Then the docs: a decision-log entry, the README (live link placeholder, what runs where, setup) and DEMO.md.
9. **Your PowerShell steps, one command per line:**
   - create the project and database (in the location you choose);
   - turn on email and Google sign-in;
   - deploy rules and indexes;
   - create the key, base64-encode it, add it to Vercel and delete it locally;
   - set the `VITE_FIREBASE_*` variables;
   - add the authorised domain;
   - deploy;
   - test end to end with two accounts, including the refused group link.

## What I won't be able to test

I can't test these myself:

- **On Vercel:** the deployed function, bundling and cold starts (unless a local `vercel build` covers the bundling).
- **Real Firebase:** that a real service account works with `verifyIdToken` and Firestore, and that the real spendingByMonth index builds.
- **Google sign-in:** the popup and the redirect on the Vercel domain, and the `/__/auth` rewrite.
- **Speed:** real latency between Vercel and Firestore.

The live steps in step 9 cover each of these so you can check them.

## Dependencies

No new packages:

- `firebase-admin` and `zod` move from `functions/package.json` to the root, at the same versions.
- `firebase-functions` is removed.
- The handlers use the standard Web `Request`/`Response` API, so `@vercel/node` isn't needed.
- The Vercel CLI is your global install, not a project dependency.

**Please confirm moving `firebase-admin` and `zod` to the root** counts as allowed.
