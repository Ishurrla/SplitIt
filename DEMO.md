# Try SplitIt locally, and try to break in

About 10 minutes. Everything runs on your machine against the Firebase emulators; nothing touches a real Firebase project.

## 1. Start it

You need Node 22+, pnpm, Java 21 and the Firebase CLI (`npm install -g firebase-tools`). In the project folder:

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm emulators
```

Wait for "All emulators ready". In a second terminal:

```powershell
pnpm seed
```

```powershell
pnpm dev
```

`pnpm seed` wipes the emulators' accounts and data, then creates the demo through the real Cloud Functions. It prints the group ids and links; they change on every run.

| Person     | Email              | Password       | Groups                        |
| ---------- | ------------------ | -------------- | ----------------------------- |
| Ada Okafor | `ada@example.com`  | `splitit-demo` | Lekki weekend, Tokyo spring   |
| Bayo Lawal | `bayo@example.com` | `splitit-demo` | Lekki weekend, Tokyo spring   |
| Chi Eze    | `chi@example.com`  | `splitit-demo` | Lekki weekend only (outsider) |

- **Lekki weekend** is in naira (NGN, kobo). It has three expenses, including an uneven three-way split and a two-person split, and a partial payment from Chi to Ada.
- **Tokyo spring** is in yen (JPY, no decimals), between Ada and Bayo.

## 2. Look around as a member

Open http://localhost:5173 and log in as Ada.

- The **dashboard** shows naira and yen on separate lines. They are never added together.
- **Lekki weekend** shows the ledger, where everyone stands, and the settle-up plan.
- **Live updates:** open the same group as Bayo in a second browser (or a private window). Add an expense in one window and watch it appear in the other.

## 3. Try to read a group you're not in

Log out, then log in as Chi, who is not in Tokyo spring.

**Through the app.** Paste the Tokyo spring link that `pnpm seed` printed. You get "You're not in this group." A group that doesn't exist looks exactly the same, so the page doesn't even confirm the group exists.

**Through the SDK.** Open DevTools (F12) → Console. In development the app adds a few helpers on `__splitit`. They use the same Firebase client and the same sign-in as the page, so the security rules decide every answer. Replace `TOKYO` and `LEKKI` with the ids from the seed output:

```js
__splitit.whoAmI()
await __splitit.read('groups/TOKYO') // refused (permission-denied)
await __splitit.read('groups/TOKYO/expenses') // refused
await __splitit.read('groups/TOKYO/members') // refused
await __splitit.read('groups') // refused: you can't list every group
await __splitit.create('groups/TOKYO/members/' + __splitit.whoAmI(), { role: 'owner' }) // refused: no adding yourself

await __splitit.read('groups/LEKKI') // allowed: Chi is a member
await __splitit.write('groups/LEKKI', { ['balances.' + __splitit.whoAmI()]: 0 }) // refused: no wiping your own debt
await __splitit.create('groups/LEKKI/expenses/fake', { title: 'x', amountMinor: 1 }) // refused: money only moves through functions
await __splitit.remove('groups/LEKKI') // refused
```

`read` also logs the data when it is allowed. Paths with an even number of parts are documents; odd ones are collections.

The rules allow reads only. Every write goes through a Cloud Function that re-checks membership, amounts and splits. The function tests (`pnpm test:functions`) cover attempts such as paying more than is owed, or editing someone else's expense.

## 4. One thing that will look like a hole but isn't

The **Emulator UI** (http://127.0.0.1:4000) shows every document in every group. It talks to the emulator as an administrator and skips the security rules, just as the Firebase console does for a project's owner. Use it to inspect the data; use the app or the console helpers above to test what a user can reach.

## 5. The automated version

Stop `pnpm emulators` first, because the test suites start their own emulators on the same ports:

```powershell
pnpm test:rules
```

This runs 126 checks against `firestore.rules` and `storage.rules`, including an outsider trying every collection, receipt and profile in someone else's group. Signed-out visitors get nothing, and even a group's owner can't write money data directly. It prints a pass/fail table at the end.
