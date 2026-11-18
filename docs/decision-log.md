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
