# Decision log

Short entries: what happened, what was tried, what was chosen and why. Newest at the bottom.

## Phase 0

### 1. No Blaze plan: emulator-first, frontend-only deploy

- Cloud Functions and Cloud Storage need the Blaze plan (billing card); Spark has no Storage at all.
- Options: get Blaze now, or build everything against the Emulator Suite.
- Chose the emulators with the offline project id `demo-splitit`. A `demo-` id can never reach real cloud services by accident and needs no login.
- Only the frontend gets deployed (Vercel). Functions, Storage, receipts and the rules tests are demonstrated locally. The README must say this plainly.

### 2. Region: `europe-west1` for Firestore, Functions and Storage

- Firestore's location is permanent. Candidates were `europe-west1` (Belgium), `europe-west2` (London) and `africa-south1` (Johannesburg).
- Lagos traffic mostly leaves on submarine cables that land in Europe, so Johannesburg is often not faster despite being on the same continent.
- Chose `europe-west1`: similar latency to London, Cloud Run's cheaper pricing tier, every needed service available. Functions sit in the same region as the database to avoid a cross-region hop inside each transaction.

### 3. TypeScript 7 broke ESLint, pinned to TypeScript 6.0

- The Vite template installed TypeScript 7 (the native Go compiler). `pnpm peers check` showed `typescript-eslint` only supports `>=4.8.4 <6.1.0`, and type-aware lint rules need the JavaScript compiler API that 7 doesn't ship.
- Options: drop type-aware lint (lose rules like `no-floating-promises`, which matter for Firestore calls), or pin TypeScript.
- Pinned `typescript@~6.0` in the app and in `functions/`. Revisit when typescript-eslint supports 7.

### 4. Group reads use `memberIds`, subcollections use `isMember()`

- The brief's `isMember(gid)` uses `exists()` on the member document. That works for a single `get`, but the Groups page runs a _query_ (`memberIds array-contains me`), and Firestore only allows a query if the rule can be proved from the query's own filters.
- Tried both in the emulator. With `allow read: if isMember(gid)` a single group `get` was allowed but the `array-contains` query was denied with `permission-denied`. With the `memberIds` rule both were allowed.
- Chose `request.auth.uid in resource.data.memberIds` for `groups/{gid}` (no extra reads) and `isMember(gid)` for everything under it. The cost is two membership records to keep in step, so every function that changes membership writes both in one transaction.

### 5. Other people's profiles: copy onto `members` instead of opening `users`

- The prototype lets you read the `users` document of anyone who shares a group with you. A rule can't answer "do we share _some_ group?" without knowing which group, and checking several groups would eat into the 10-document-access limit.
- Chose: `users/{uid}` is readable only by its owner; `displayName`, `photoPath` and `photoURL` are copied onto `groups/{gid}/members/{uid}`.
- Side benefit: emails are never visible to other members. Cost: a function must update the copies when someone renames themselves.

## Phase 1

### 6. `updateProfile`: one callable for name and photo, written in batches

- Names and photos are copied onto every `members` document (entry 5), so a client changing `displayName` directly on `users/{uid}` would leave the copies stale, and clients may not write `members` at all.
- Took `displayName` and `photoPath` out of the client allow-list in the rules. The `updateProfile` callable validates input with zod, checks the photo sits in the caller's own `avatars/` folder and really exists in Storage, then updates every member copy and `users/{uid}`.
- Writes go in batches of at most 500, run one after another. Batches are not atomic with each other, so member copies are written first and `users/{uid}` last: if a batch fails, the profile still shows the old values, and repeating the call repairs everything (it is idempotent).
- Testing showed the Firestore emulator accepts a single 521-write batch, so the 520-group integration test proves the end result but not the split. The split is proven by a unit test on `chunks()` instead.

### 7. Functions silently deployed to `us-central1`

- The first `updateProfile` tests all failed with `not-found`. The emulator log showed `us-central1-updateProfile`, not `europe-west1`.
- Cause: `index.ts` called `setGlobalOptions({ region })` and then re-exported the function. In ES modules every `import`/`export ... from` is evaluated before the file's own code, so the function was defined before the global option existed.
- Chose explicit options passed to each `onCall()` from `lib/options.ts`, which does not depend on module order. A real deploy would have put the functions on another continent from the database with no error.

### 8. Two names for the same Storage bucket in tests

- The photo test failed: the function said the uploaded avatar did not exist.
- `@firebase/rules-unit-testing` uploads to `gs://demo-splitit` by default, while the Admin SDK in the functions emulator (and the app's config) uses `demo-splitit.appspot.com`.
- Chose to name the app's bucket explicitly in every test (`BUCKET` in `tests/rules/world.ts`), so tests and app use the same bucket.

## Phase 2

### 9. Logging out bounced people to the sign-in page

- Checked in the browser: Log out from Settings landed on `/auth?next=/app/settings` instead of the landing page.
- Cause: `signOut()` fires the auth listener at once, `<RequireAuth>` re-renders first and redirects to sign-in (as it should for an expired session), and our `navigate('/')` came too late.
- Chose to navigate away from `/app` first and sign out second. The guard keeps its behaviour for real session loss; a deliberate log-out no longer looks like one.

### 10. Creating `users/{uid}` on first sign-in without a race

- Firebase reports the new user (and the app creates the profile) inside `createUserWithEmailAndPassword`, before `updateProfile()` can set the typed name. Reading the name from the `User` object would have saved a fallback such as the email prefix ("dami") instead of "Dami Ade". This was designed around up front, not observed as a bug; the browser check confirmed the typed name is stored.
- The sign-up form now records the typed name just before creating the account, and profile creation prefers it. Creation runs in a transaction that writes only when the document is missing, because the rules allow `create` but not overwriting, and a double render or two tabs could otherwise collide.
- `email` and `photoURL` are read from the ID token, not the `User` object, because those are what the rules compare against.

### 11. Google redirect sign-in on the deployed site (not testable on the emulator)

- On phones we use `signInWithRedirect`. Browsers that block third-party storage (Safari, and Chrome's phase-out) break the redirect flow when the app's domain differs from `authDomain` (`<project>.firebaseapp.com`); the emulator does not reproduce this.
- Options for deploy time: keep the popup everywhere, serve the auth helper from the Vercel domain (a rewrite of `/__/auth/*`), or set `authDomain` to the Vercel domain.
- For now: popup on desktop, redirect on touch screens and when a popup is blocked. Revisit in Phase 8 with the real Vercel domain, together with adding it to Firebase Auth's authorised domains.
