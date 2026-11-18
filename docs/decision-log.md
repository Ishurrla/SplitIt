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
