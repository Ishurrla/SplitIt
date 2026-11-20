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

## Phase 3

### 12. Any member can invite, only the owner sees pending invites

- The prototype lets every member invite people; the approved rules (Phase 1) let only the owner read `invites`.
- Options: loosen the rule so members can read invites, or route creation through the callable and keep the rule.
- Chose the second. `createInvite` checks membership and returns the link to whoever asked; the pending list in the invite dialog is shown to the owner only. The rules tests stay as approved, and tokens of other people's email invites are never shown to plain members.

### 13. An email invite is protected by its token, not by the email check

- Email invites only work for the signed-in user whose email matches. But Firebase lets anyone create an email/password account for any address without proving they own it, so the email match alone proves little.
- Options: require verified emails (adds a verification flow), or rely on the token.
- Chose: the token (128 random bits, shown only to the inviter) is the secret; the email check is an extra filter. Errors mask the address (`a•••@example.com`) so a wrong-email screen can't be used to harvest who was invited. If the reviewer wants more, requiring `email_verified` for email invites is a small change in `acceptInvite`.

### 14. Leaving a group without breaking its history

- Removing someone deletes their member document (that is what ends their access, through `isMember()` in the rules). But their uid stays on old expenses, and those need a name.
- Chose: leaving or removal requires a zero balance, and the name moves to `pastMembers` on the group. An owner leaving hands ownership to the longest-standing member; the last member leaving deletes the group, its invites and its files.
- Not in the prototype, so kept small: no ownership transfer screen and no "kick with a balance".

### 15. Shared zod schemas live under `functions/`, from this phase

- You asked for shared schemas in Phase 4; the Phase 3 callables (`createGroup`, `createInvite`) already had client forms, so sharing started now.
- Only `functions/` is uploaded when functions deploy, so the shared file has to live there (`functions/src/shared/schemas.ts`); the client imports it by relative path. It exports plain input types too, so the client never imports zod itself.
- `money.ts` stays as two identical copies with a test, as the brief asked.

## Phase 4

### 16. Balances move by the difference, and the tests rebuild them from scratch

- `saveExpense` and `deleteExpense` change `groups/{gid}.balances` inside the same transaction as the expense: take the old expense's effect out, put the new one in. A pure `rebalance()` does the arithmetic so it can be unit-tested, and the function refuses to save if the result doesn't sum to zero.
- The callable tests don't trust that arithmetic: after every create, edit and delete they rebuild the balances from the raw expense documents and compare to the kobo. A property test does 500 random creates, edits and deletes.
- To check the tests themselves, I broke the function five ways (edit adds instead of replacing, delete forgets the balances, anyone may edit, frozen expenses editable, split members unchecked). Every break was caught. Ten simultaneous saves also land exactly, because each is a transaction.

### 17. Expenses involving someone who left are frozen

- Leaving needs a zero balance, but the person's uid stays on old expenses. Editing or deleting such an expense would give them a balance again after they have gone, with no way for them to settle it.
- Options: let it happen (and silently break the "zero to leave" promise), recreate their balance, or freeze those expenses.
- Chose to freeze: both callables refuse with "Bayo has left the group, so this expense can no longer be changed.", and the ledger shows "Bayo (left)" with the same sentence instead of Edit/Delete. If a fix is ever needed, the person can rejoin, which unfreezes it.

### 18. The client picks the expense id so the receipt can go first

- `saveExpense` checks the receipt file exists under `receipts/{gid}/{eid}/`, so the photo must be uploaded before the expense exists. The client makes a Firestore auto-id locally (no write) and uploads there; the function treats an unknown id as "new" and a known id as "edit", with the creator check.
- Trade-off: if the upload succeeds but the save fails, the photo stays in Storage, because the rules don't let clients delete receipts. It is invisible (no expense points to it) and costs little; a cleanup function could sweep these later. Replacing or removing a receipt, or deleting the expense, deletes the old files server-side.

### 19. A screen reader would have read every name twice

- The first expense-form test failed with "found multiple elements labelled Bayo": the checkbox, and the avatar's SVG next to it, which also had `aria-label="Bayo"`.
- In lists the name is already written beside the avatar, so the avatar is noise there. Added a `decorative` option that hides it from assistive technology; the avatar stacks, where there is no visible name, keep their labels.

## Phase 5

### 20. "Never more than the payer owes that person", with pooled balances

- Balances are kept per person, not per pair, so "what Bayo owes Ada" isn't stored anywhere. The settle-up plan names an amount, but the plan can change as soon as anyone adds an expense.
- Chose two limits. The server (`recordPayment`) allows at most the smaller of what the payer owes in total and what the receiver is owed in total, read inside the transaction. That can never push either balance past zero. The dialog is stricter and offers at most the plan's amount for that line, as the prototype does.
- Two payments recorded at the same moment are two transactions on the same group document: the second re-reads what the first left and is refused. The tests fire two full payments, and five partial ones, at once; exactly the ones that fit go through.
- Only the payer or the receiver may record a payment, because payments can't be edited or deleted afterwards. Others see the tick box disabled.

### 21. Greedy settle-up, with ties broken by uid

- The truly fewest payments is NP-hard (it means finding subsets of people whose balances cancel out). Greedy largest-creditor/largest-debtor clears at least one person per payment, so never more than n − 1.
- Ties are broken by uid so every member sees the same plan, whatever order Firestore returns the balances in. A property test runs 2,000 random groups: everyone ends at exactly zero, amounts are positive integers, at most n − 1 payments, and the plan is identical after shuffling. Breaking the tie rule, or matching the smallest debtor first, both fail the tests.

### 22. `recomputeBalances` refuses rather than guess

- Rebuilding from raw expenses and payments must give zero for everyone who has left (they left at zero). If it doesn't, something was written outside the functions, and there is nowhere to put that person's money.
- Chose: the function stops with a clear error and changes nothing, and logs the details. When the rebuilt balances simply differ from the stored ones, it saves the rebuilt ones and logs an activity entry, so a correction is never silent. The owner can run it from the group page ("Check them against every expense").

### 23. A deleted account left people stuck on an error screen

- Found while seeding the browser check: the browser still held a sign-in for an account the emulator no longer had. Token refresh failed, the app showed "Couldn't set up your profile" with only a Try again button, and trying again repeated the same failure forever. In production the same happens when an account is deleted or disabled.
- First fix didn't work: I listed the error codes I expected, but the real one was `auth/invalid-refresh-token`, which I found by forcing a token refresh in the page.
- Now those codes sign the person out, which sends them to the sign-in page with their destination kept. The error screen also has a Log out button as a way out for anything else.

### 24. Proving the transaction is what stops overpayment (closing the Phase 5 gap)

- Removed the transaction from `recordPayment` (same reads and writes, done one by one) and ran the tests. The five-partial-payments race failed, as it should. The two-full-payments race still passed: the test could not have caught the missing transaction.
- Tried six simultaneous full payments instead: still passed. The functions emulator handles its first burst of calls one at a time and runs later ones in parallel, so whichever race test ran first never really raced.
- Chose three rounds in fresh groups for the full-payment race, and kept the two-payment race after it. Without the transaction all three race tests now fail; with it, all pass. The lesson for the write-up: a concurrency test has to be shown to fail without the protection, or it may be testing nothing.

## Phase 6

### 25. One set of listeners per open group, counted

- Each open group needs four `onSnapshot` listeners (the group, expenses, payments, activity). React's StrictMode mounts every screen twice in development, and moving between the group page and its settle page would otherwise stop and restart them, or leave a second set running.
- Chose a small reference-counted registry: the first screen to ask starts the listeners, later ones share them, and they stop when the last one lets go. Unit-tested, including the StrictMode mount-unmount-mount pattern.
- Checked in the browser with a dev-only counter on `window`: exactly 4 listeners on the group and settle pages, 0 on other pages, 4 again after pressing Back, 0 after being removed and leaving the page.
- The listeners write straight into TanStack Query's cache, and on an open group those queries never fetch on their own, so nothing is read twice.

### 26. "Removed while viewing" showed the wrong message

- When someone is removed, all four listeners are refused with `permission-denied` at once. The first refusal set the "no access" state with "access just ended" wording and cleared the group data; the second one then saw no data, concluded the person had never had access, and overwrote the wording.
- Found in the two-window check (Ada removed Bayo while Bayo's page was open). Fixed by letting the first refusal decide and ignoring the rest. Re-tested: Bayo now sees "You're not in this group any more." with the real `onSnapshot … permission-denied` line, and no errors.
- Leaving a group yourself is marked beforehand, so your own refusal doesn't flash that screen on the way out (checked with a DOM watcher: it never appeared).

### 27. Search runs in the browser

- Firestore has no "contains" search for text, and a search service (Algolia and similar) would be a new dependency and a copy of private data outside Firebase.
- Chose to search in the browser over what the person can already read: their groups, and each group's latest 500 expenses, loaded when the search box opens. Every word typed must appear, case and accents ignored. This is honest about its reach (the README says so) and can never show anything the rules wouldn't.

## Phase 7

### 28. Money in different currencies is never added up

- The dashboard tiles (you owe, owed to you, net) come from each group's stored balance. A pure function groups them by currency and only ever adds amounts in the same currency; there is no grand total and no exchange rate anywhere. Each tile shows one line per currency with its code, and the note "Balances are kept per currency. SplitIt does not convert between them." is always shown, not only when there are several currencies, so the rule is visible before it matters.
- The spending chart follows the same rule: one row per currency from the function, and tabs to switch between them.

### 29. `spendingByMonth`: my share, by month, in my time zone

- It reads only expenses where I'm in the split (`splitUserIds` array-contains me) in groups I'm in, and adds `splits[me]`, never the whole amount, so paying for others isn't "spending". Edits and deletes need no special handling: it reads what the expenses say now (tests change a share, remove me from the split, and delete the expense).
- Months start at midnight in the viewer's time zone, sent by the browser and checked on the server, so 00:30 on 1 November in Lagos counts as November. The bucketing is a pure function with tests for yen, several currencies and that boundary.
- Trade-offs: an expense is filed under the month it was added (there is no separate "date spent" field), and the query needs the (`splitUserIds`, `createdAt`) composite index in `firestore.indexes.json`, which the emulator doesn't check, so it is unverified until a real deploy.

### 30. Avatar photos are fetched by URL, without the Storage SDK

- The order is uploaded photo, then Google photo, then the illustration picked by a hash of the uid. Avatars appear everywhere, including the expense form, which is tested in jsdom without Firebase.
- `avatars/` is public-read in storage.rules, so the download URL can be built from the path alone. That keeps `Avatar` free of Firebase, lets it try each source in order and fall back on a load error, and makes the order a small pure function with tests. Receipts and covers are private and still use `getDownloadURL`.
- `updateProfile` now also deletes the previous photo file when it is replaced or removed (tested).

## Phase 8

### 31. The bundle warning: lazy routes, then vendor files, and one surprise

- The build was one 1,178 kB file. Loading each signed-in screen on first visit (route `lazy`) and moving Storage and Functions out of `firebase.ts` (into `firebaseServices.ts`, used only by screens that upload or call functions) cut the first file to 872 kB. The warning stayed.
- A source-map count showed what was left: Firestore, React, Firebase Auth, and `re2js` (263 kB of source). Nothing in SplitIt imports `re2js`; it comes with `@firebase/firestore`. So it can't be removed, only separated.
- Chose vendor groups in `vite.config.ts` (Firestore, re2js, other Firebase, React, TanStack Query). The largest file is now Firestore at 352 kB, the app's own first file is 32 kB, and library files keep their cache across app releases. The group for `re2js` only took effect with a higher priority, because under pnpm it is reached through Firestore's own `node_modules`.
- The same build also warned that `RequireAuth`'s on-demand import of `auth/actions` did nothing, since the sign-in page imports it anyway. It is now a plain import, and the guard's component test mocks it instead.

### 32. The seed goes through the real functions, and the console helpers go through the real rules

- `pnpm seed` signs each demo person in and calls `createGroup`, `acceptInvite`, `saveExpense` and `recordPayment`, instead of writing documents with admin access. Slower, but the balances, members and activity are exactly what the app would produce, and a broken function breaks the seed. The printed balances were checked by hand (Lekki: Ada +6,244,141 kobo; Tokyo: Ada +¥37,324; both sum to zero).
- For the reviewer's "try to read another group", `__splitit.read/write/create/remove` in the dev console use the page's own Firestore client and sign-in, so the rules decide, unlike the Emulator UI, which bypasses them (DEMO.md says so). They are loaded only when `import.meta.env.DEV` is true and are absent from the production build.

### 33. Staying on Spark: an honest preview site, and three small fixes found on the way

- **The live site.** Only the frontend is deployed. A normal build would show a sign-in that either fails (no real Firebase project) or, with Auth and Firestore on Spark, signs people in to an app that can't save anything, because every change goes through a function.
- Chose a separate Vite mode, `site` (`pnpm build:site`, which Vercel runs):
  - a notice on every page, linking to the README;
  - `/auth`, `/app/*` and `/join/*` replaced by a page explaining why;
  - Firebase fixed to the `demo-` project id, which can't reach any real service, so the site needs no Firebase settings.
- Checked in a browser: the notice is on every page, the signed-in paths show the explanation, and the page makes no outside requests. The build refuses to run without `VITE_README_URL` rather than shipping a notice with a broken link.
- **Vercel and pnpm 11.** Vercel only follows `packageManager` with an experimental setting, so `vercel.json` runs install and build through `npx pnpm@11.1.3`.
- **The 5 MB upload tests** (receipt and avatar) failed once with the default 20 s timeout, during a run that took more than 10 minutes in total. In the next run they passed in seconds. They now get 60 s each. The rule is unchanged.
- **The seed raced the emulators.** The walkthrough script exposed it:
  - The functions emulator opens its port before loading the functions, so an early `pnpm seed` got 404s. The seed now waits until `createGroup` answers: a plain GET returns 400 once it is loaded, and 404 before.
  - After a previous seed, the Firestore emulator answers its first reset with 499 "call already cancelled". The seed retries quietly; four runs in a row and two full walkthroughs then passed.
  - Vite's `localhost` listens on IPv6 (`::1`) only on this machine, so the walkthrough's "is the app up" check tries both 127.0.0.1 and ::1.

## Phase 9

### 34. No Blaze: the callables move to one Vercel function, and the full app goes live on Spark

- **Why.** Blaze isn't available, so Cloud Functions and Storage can't be deployed. Auth and Firestore (rules and indexes) work on Spark, so only the server logic needed a new home. Plan approved first: [vercel-migration-plan.md](vercel-migration-plan.md).
- **Shape.**
  - `functions/src` moved to `server/` with `git mv`, keeping history.
  - Handler bodies are unchanged apart from `onCall` → `defineHandler`, `HttpsError` → `ApiError` and the Storage switch. The request keeps the callable's shape (`{ auth: { uid, token }, data }`), so every membership, owner and amount check is the same line of code as before.
  - `firebase-functions` is gone, and `firebase-admin` and `zod` moved to the root package.
- **One function, not 14.** Vercel Hobby refuses more than 12 functions per deployment when no framework bundles them, so `api/[name].ts` serves every `/api/<name>`. Only that 10-line file is Vercel-specific: it and the local Node adapter both call `handleApi(name, Request)`.
- **Same protocol as callables.**
  - Requests are `POST { data }` with `Authorization: Bearer <ID token>`.
  - Answers are `{ result }` or `{ error: { code, message } }`, with the callables' HTTP statuses.
  - The client wrapper rethrows `functions/<code>`, so `callableErrorMessage`, `isConnectionError` and every screen were left alone. A network failure becomes `unavailable`, and a non-JSON answer (a platform error page) becomes `internal`.
- **Locally, no `vercel dev`.** A dev-only Vite plugin serves `/api` from `server/` on the same origin, configured from `VITE_USE_EMULATORS`. So `pnpm dev`, the seed and the tests need no Vercel login. The seed now calls `/api` on `pnpm dev`, so DEMO.md's order became emulators → dev → seed.
- **Security.**
  - `firestore.rules` didn't change; the 126 rules tests are untouched.
  - The token is verified with `verifyIdToken`, which also checks it was issued for this project.
  - Bodies are limited to 32 KB, POST and JSON only, with no CORS headers (same origin; a bearer token rather than a cookie means no CSRF).
  - A best-effort per-person rate limit runs in each instance's memory.
  - The service account is one base64 Vercel variable. `server/admin.ts` refuses emulator settings on Vercel, refuses both modes at once, and refuses a non-`demo-` emulator project.
- **Storage.** Stays emulator-only, behind two switches:
  - **Client:** `VITE_STORAGE_UPLOADS`, which only counts with the emulators. When it's off, the receipt, cover and avatar uploads are hidden, each with a one-line note.
  - **Server:** on only when `FIREBASE_STORAGE_EMULATOR_HOST` is set. Off, photo paths get `failed-precondition` and clean-up is skipped.
  - **Bundle:** the Storage SDK is now loaded on demand. Its first vendor group took `@firebase/util` with it (a group pulls in what it matches and that code's dependencies), which made the Storage file load on every page. Storage is now the lowest-priority group, so the live site's `index.html` no longer preloads it.
- **Tests.**
  - The 102 function tests moved to `tests/api/` with their bodies unchanged. Only the harness changed: each file starts its own server on a free port, and calls go through the app's own API client with Auth-emulator ID tokens.
  - 12 new tests cover the HTTP layer, tokens, the rate limit, and Storage off (in its own process, so the environment can differ).
  - The token tests start from a real emulator token and change one claim. A hand-made token failed for the wrong reason: in emulator mode, `verifyIdToken` also checks the account exists and the token isn't older than the account.
- **Mutation check, repeated.** The race tests passed three runs in a row. With recordPayment's transaction replaced by plain reads and writes, exactly the three race tests failed and the other 17 passed; with the transaction restored, the full suite passes again.
- **The production path.**
  - The first `vercel build` attempt failed: the CLI installs its builders with symlinks, which Windows refused (EPERM). As a stopgap, `api/[name].ts` was bundled on its own with Vite's SSR build and called with Web `Request`s against the emulators: 16 checks passed.
  - A later `vercel build` worked. It ran without a Vercel login, from a local `.vercel/project.json` (git-ignored) that copies `vercel.json`. It found three problems the Vite bundle could not:
    - **Node version.** `"engines": ">=22"` made Vercel pick `nodejs26.x`, a version never tested here. It is now `24.x`, the version every test ran on.
    - **Routing.** Vercel routes `/api/createGroup` to `/api/[name]?name=createGroup`, so the entry reads the `name` query first and falls back to the last path segment.
    - **Type checking.** Vercel type-checks the function with the nearest `tsconfig.json`, which was the root one (references only, no options). `api/tsconfig.json` now extends the server config. Its own TypeScript also inferred `unknown[]` for a `Set` spread in `spendingByMonth`, so that `Set` now has an explicit `<string>`.
  - After the fixes, the build is clean: one function, `nodejs24.x`, only the `firebase-admin` and `zod` dependency trees traced in, and the SPA rewrite skips `/api`. The function file Vercel built, `.vercel/output/functions/api/[name].func/api/[name].js`, was then called against the emulators with Vercel's routed URL form: the same 16 checks all passed.
  - Still untested: Vercel's runtime wrapper around that file, and real Firebase.
- **Region.** Firestore `europe-west3` and Vercel `fra1`, both in Frankfurt, because each call makes several Firestore round trips. The old `REGION` constant only applied to Cloud Functions and is gone.
- **Removed:** the preview-site mode (`build:site`, the notice, `VITE_README_URL`). The landing footer and Settings now say plainly what is emulator-only.

## The three entries worth reading first

1. **24, proving the transaction is what stops overpayment.** A test that passed with the safeguard removed proved nothing. Taking the transaction out and watching the race tests fail, after making the race real, is what proved it.
2. **26, "removed while viewing" showed the wrong message.** A bug that only a two-window test could show: four listeners refused at once, and the last one rewrote what the first had decided.
3. **4, group reads use `memberIds`, subcollections use `isMember()`.** The rules decision that the rest of the data model is built around: Firestore only allows a query whose rule it can prove from the query itself.
