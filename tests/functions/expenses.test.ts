import { describe, expect, it } from 'vitest'
import {
  admin,
  client,
  expectCode,
  fileExists,
  putFile,
  read,
  useEmulators,
  type TestClient,
} from './harness'

// saveExpense and deleteExpense. After every change the stored balances are compared with balances
// rebuilt from scratch out of the raw expense documents, so "exactly correct" means to the kobo.
useEmulators()

type Splits = Record<string, number>
interface Saved {
  expenseId: string
  created: boolean
}

let idCounter = 0
/** A 20-character id in the Firestore auto-id style, as the client makes them. */
function newId(): string {
  idCounter += 1
  return `exp${String(idCounter).padStart(4, '0')}${'x'.repeat(13)}`
}

async function setupGroup(names: string[], currency = 'NGN') {
  const people: TestClient[] = []
  for (const name of names) people.push(await client({ profile: name }))
  const [owner, ...rest] = people as [TestClient, ...TestClient[]]
  const { groupId } = (await owner.call('createGroup', {
    name: 'Ledger',
    currency,
    cover: 'plain',
  })) as {
    groupId: string
  }
  const { token } = (await owner.call('createInvite', { groupId })) as { token: string }
  for (const p of rest) await p.call('acceptInvite', { token })
  return { groupId, people }
}

function save(
  c: TestClient,
  groupId: string,
  e: {
    expenseId?: string
    title?: string
    amountMinor: number
    paidBy: string
    splits: Splits
    receiptPath?: string | null
  },
) {
  return c.call('saveExpense', {
    groupId,
    expenseId: e.expenseId ?? newId(),
    title: e.title ?? 'Suya and drinks',
    amountMinor: e.amountMinor,
    paidBy: e.paidBy,
    splits: e.splits,
    receiptPath: e.receiptPath ?? null,
  }) as Promise<Saved>
}

const balancesOf = async (groupId: string) =>
  (await read(`groups/${groupId}`))?.balances as Record<string, number>

/** Balances rebuilt from the raw expenses, independently of the functions' arithmetic. */
async function rebuiltBalances(groupId: string): Promise<Record<string, number>> {
  const group = await read(`groups/${groupId}`)
  const result: Record<string, number> = Object.fromEntries(
    (group?.memberIds as string[]).map((u) => [u, 0]),
  )
  const expenses = await admin(async (db) =>
    (await db.collection(`groups/${groupId}/expenses`).get()).docs.map((d) => d.data()),
  )
  for (const e of expenses) {
    result[e.paidBy as string] = (result[e.paidBy as string] ?? 0) + (e.amountMinor as number)
    for (const [u, share] of Object.entries(e.splits as Splits))
      result[u] = (result[u] ?? 0) - share
  }
  return result
}

async function expectBalancesExact(groupId: string, expected?: Record<string, number>) {
  const stored = await balancesOf(groupId)
  expect(stored).toEqual(await rebuiltBalances(groupId))
  expect(Object.values(stored).reduce((a, b) => a + b, 0)).toBe(0)
  expect(Object.values(stored).every(Number.isSafeInteger)).toBe(true)
  if (expected) expect(stored).toEqual(expected)
}

describe('saveExpense: adding', () => {
  it('adds a 3-way uneven split: the extra kobo goes to the first person, balances exact', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    const { expenseId, created } = await save(a, groupId, {
      amountMinor: 10_000,
      paidBy: a.uid,
      splits: { [a.uid]: 3_334, [b.uid]: 3_333, [c.uid]: 3_333 },
    })
    expect(created).toBe(true)
    await expectBalancesExact(groupId, { [a.uid]: 6_666, [b.uid]: -3_333, [c.uid]: -3_333 })
    const doc = await read(`groups/${groupId}/expenses/${expenseId}`)
    expect(doc).toMatchObject({
      title: 'Suya and drinks',
      amountMinor: 10_000,
      paidBy: a.uid,
      createdBy: a.uid,
      receiptPath: null,
    })
    expect((doc?.splitUserIds as string[]).sort()).toEqual([a.uid, b.uid, c.uid].sort())
    expect((await read(`groups/${groupId}`))?.expenseCount).toBe(1)
  })

  it('accepts a custom uneven 3-way split, and a payer who is not in the split', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    await save(b, groupId, {
      amountMinor: 1_000_001,
      paidBy: c.uid,
      splits: { [a.uid]: 500_000, [b.uid]: 499_999, [c.uid]: 2 },
    })
    await save(b, groupId, {
      amountMinor: 777,
      paidBy: a.uid,
      splits: { [b.uid]: 700, [c.uid]: 77 },
    })
    await expectBalancesExact(groupId, {
      [a.uid]: -500_000 + 777,
      [b.uid]: -499_999 - 700,
      [c.uid]: 1_000_001 - 2 - 77,
    })
  })

  it('works in yen: whole yen only, 1000 split 3 ways is 334 + 333 + 333', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'], 'JPY')
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    await save(a, groupId, {
      amountMinor: 1_000,
      paidBy: b.uid,
      splits: { [a.uid]: 334, [b.uid]: 333, [c.uid]: 333 },
    })
    await expectBalancesExact(groupId, { [a.uid]: -334, [b.uid]: 667, [c.uid]: -333 })
    await expectCode(
      save(a, groupId, { amountMinor: 1_000.5, paidBy: a.uid, splits: { [a.uid]: 1_000.5 } }),
      'invalid-argument',
      /whole numbers/,
    )
  })

  it('logs the expense in the activity timeline', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    await save(a, groupId, {
      title: 'Fuel',
      amountMinor: 2_400_000,
      paidBy: a.uid,
      splits: { [a.uid]: 2_400_000 },
    })
    const acts = await admin(async (db) =>
      (
        await db.collection(`groups/${groupId}/activity`).where('kind', '==', 'expense.added').get()
      ).docs.map((d) => d.data()),
    )
    expect(acts).toHaveLength(1)
    expect(acts[0]).toMatchObject({
      actorId: a.uid,
      payload: { title: 'Fuel', amountMinor: 2_400_000 },
    })
  })

  it('keeps balances exact when ten people add expenses at the same moment', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        save([a, b, c][i % 3] as TestClient, groupId, {
          amountMinor: 1_001 + i,
          paidBy: ([a, b, c][i % 3] as TestClient).uid,
          splits: { [a.uid]: 1_001 + i - 2, [b.uid]: 1, [c.uid]: 1 },
        }),
      ),
    )
    await expectBalancesExact(groupId)
    expect((await read(`groups/${groupId}`))?.expenseCount).toBe(10)
  })
})

describe('saveExpense: refusing bad input', () => {
  it('refuses splits that do not add up, and says which way', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo'])
    const [a, b] = people as [TestClient, TestClient]
    await expectCode(
      save(a, groupId, {
        amountMinor: 1_000,
        paidBy: a.uid,
        splits: { [a.uid]: 500, [b.uid]: 499 },
      }),
      'invalid-argument',
      /unassigned/,
    )
    await expectCode(
      save(a, groupId, {
        amountMinor: 1_000,
        paidBy: a.uid,
        splits: { [a.uid]: 500, [b.uid]: 501 },
      }),
      'invalid-argument',
      /over the total/,
    )
    await expectBalancesExact(groupId, { [a.uid]: 0, [b.uid]: 0 })
  })

  it('refuses zero, negative, fractional and absurd amounts, and zero shares', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    for (const amountMinor of [0, -100, 10.5, 100_000_000_001]) {
      await expectCode(
        save(a, groupId, { amountMinor, paidBy: a.uid, splits: { [a.uid]: amountMinor } }),
        'invalid-argument',
      )
    }
    await expectCode(
      save(a, groupId, { amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 100, other: 0 } }),
      'invalid-argument',
    )
  })

  it('refuses an empty split, an empty title, unknown fields and a made-up id', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    await expectCode(
      save(a, groupId, { amountMinor: 100, paidBy: a.uid, splits: {} }),
      'invalid-argument',
      /at least one person/,
    )
    await expectCode(
      save(a, groupId, { title: '  ', amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 100 } }),
      'invalid-argument',
      /title/,
    )
    await expectCode(
      a.call('saveExpense', {
        groupId,
        expenseId: newId(),
        title: 'X',
        amountMinor: 1,
        paidBy: a.uid,
        splits: { [a.uid]: 1 },
        receiptPath: null,
        createdBy: 'someone',
      }),
      'invalid-argument',
    )
    await expectCode(
      save(a, groupId, {
        expenseId: '../../balances',
        amountMinor: 1,
        paidBy: a.uid,
        splits: { [a.uid]: 1 },
      }),
      'invalid-argument',
    )
  })

  it('refuses a payer or split person who is not a member', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const outsider = await client({ profile: 'Olu' })
    await expectCode(
      save(a, groupId, { amountMinor: 100, paidBy: outsider.uid, splits: { [a.uid]: 100 } }),
      'invalid-argument',
      /who paid/,
    )
    await expectCode(
      save(a, groupId, {
        amountMinor: 100,
        paidBy: a.uid,
        splits: { [a.uid]: 50, [outsider.uid]: 50 },
      }),
      'invalid-argument',
      /in the split/,
    )
    await expectBalancesExact(groupId, { [a.uid]: 0 })
  })

  it('refuses an outsider and a signed-out caller', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const outsider = await client({ profile: 'Olu' })
    const anon = await client({ signedOut: true })
    await expectCode(
      save(outsider, groupId, { amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 100 } }),
      'permission-denied',
    )
    await expectCode(
      save(anon, groupId, { amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 100 } }),
      'unauthenticated',
    )
  })
})

describe('saveExpense: editing', () => {
  it('editing amount, payer and people leaves balances exactly right', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi', 'Dayo'])
    const [a, b, c, d] = people as [TestClient, TestClient, TestClient, TestClient]
    const first = await save(a, groupId, {
      amountMinor: 10_000,
      paidBy: a.uid,
      splits: { [a.uid]: 3_334, [b.uid]: 3_333, [c.uid]: 3_333 },
    })
    await save(b, groupId, {
      amountMinor: 9_001,
      paidBy: b.uid,
      splits: { [b.uid]: 3_001, [c.uid]: 3_000, [d.uid]: 3_000 },
    })

    // Ada changes her expense: new amount, Chi paid, and it was only Ada and Dayo, unevenly.
    const edited = await save(a, groupId, {
      expenseId: first.expenseId,
      title: 'Suya, corrected',
      amountMinor: 7_777,
      paidBy: c.uid,
      splits: { [a.uid]: 5_000, [d.uid]: 2_777 },
    })
    expect(edited.created).toBe(false)
    await expectBalancesExact(groupId, {
      [a.uid]: -5_000,
      [b.uid]: 9_001 - 3_001,
      [c.uid]: 7_777 - 3_000,
      [d.uid]: -2_777 - 3_000,
    })
    const doc = await read(`groups/${groupId}/expenses/${first.expenseId}`)
    expect(doc).toMatchObject({
      title: 'Suya, corrected',
      amountMinor: 7_777,
      paidBy: c.uid,
      createdBy: a.uid,
    })
    expect((doc?.splitUserIds as string[]).sort()).toEqual([a.uid, d.uid].sort())
    expect((await read(`groups/${groupId}`))?.expenseCount).toBe(2) // an edit is not a new expense
  })

  it('only the person who added it may edit it, and the error names them', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo'])
    const [a, b] = people as [TestClient, TestClient]
    const { expenseId } = await save(a, groupId, {
      amountMinor: 1_000,
      paidBy: a.uid,
      splits: { [a.uid]: 500, [b.uid]: 500 },
    })
    const before = await balancesOf(groupId)
    await expectCode(
      save(b, groupId, { expenseId, amountMinor: 1, paidBy: b.uid, splits: { [b.uid]: 1 } }),
      'permission-denied',
      /Only Ada can edit or delete this\./,
    )
    expect(await balancesOf(groupId)).toEqual(before)
  })
})

describe('deleteExpense', () => {
  it('takes exactly its effect back out of the balances', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    const gone = await save(a, groupId, {
      amountMinor: 10_000,
      paidBy: a.uid,
      splits: { [a.uid]: 3_334, [b.uid]: 3_333, [c.uid]: 3_333 },
    })
    await save(c, groupId, {
      amountMinor: 501,
      paidBy: c.uid,
      splits: { [a.uid]: 167, [b.uid]: 167, [c.uid]: 167 },
    })
    await a.call('deleteExpense', { groupId, expenseId: gone.expenseId })
    await expectBalancesExact(groupId, { [a.uid]: -167, [b.uid]: -167, [c.uid]: 334 })
    expect(await read(`groups/${groupId}/expenses/${gone.expenseId}`)).toBeUndefined()
    expect((await read(`groups/${groupId}`))?.expenseCount).toBe(1)
  })

  it('deleting everything brings every balance back to exactly zero', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    const ids: string[] = []
    for (const [amount, payer] of [
      [10_000, a],
      [9_999, b],
      [1, c],
      [123_457, a],
    ] as const) {
      ids.push(
        (
          await save(payer, groupId, {
            amountMinor: amount,
            paidBy: payer.uid,
            splits: { [a.uid]: amount },
          })
        ).expenseId,
      )
    }
    await a.call('deleteExpense', { groupId, expenseId: ids[0] })
    await b.call('deleteExpense', { groupId, expenseId: ids[1] })
    await c.call('deleteExpense', { groupId, expenseId: ids[2] })
    await a.call('deleteExpense', { groupId, expenseId: ids[3] })
    await expectBalancesExact(groupId, { [a.uid]: 0, [b.uid]: 0, [c.uid]: 0 })
    expect((await read(`groups/${groupId}`))?.expenseCount).toBe(0)
  })

  it('only the person who added it may delete it; a second delete says it is gone', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo'])
    const [a, b] = people as [TestClient, TestClient]
    const { expenseId } = await save(a, groupId, {
      amountMinor: 1_000,
      paidBy: a.uid,
      splits: { [b.uid]: 1_000 },
    })
    await expectCode(
      b.call('deleteExpense', { groupId, expenseId }),
      'permission-denied',
      /Only Ada/,
    )
    await a.call('deleteExpense', { groupId, expenseId })
    await expectCode(a.call('deleteExpense', { groupId, expenseId }), 'not-found')
    await expectBalancesExact(groupId, { [a.uid]: 0, [b.uid]: 0 })
  })

  it('logs the deletion with the title and amount', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const { expenseId } = await save(a, groupId, {
      title: 'Taxi',
      amountMinor: 650_000,
      paidBy: a.uid,
      splits: { [a.uid]: 650_000 },
    })
    await a.call('deleteExpense', { groupId, expenseId })
    const kinds = await admin(async (db) =>
      (await db.collection(`groups/${groupId}/activity`).get()).docs.map((d) => d.data()),
    )
    expect(kinds.find((k) => k.kind === 'expense.deleted')).toMatchObject({
      payload: { title: 'Taxi', amountMinor: 650_000 },
    })
  })
})

describe('expenses involving someone who left (pastMembers)', () => {
  /** Ada paid for Ada and Bayo, then Bayo paid the same back, so Bayo's balance is zero and he leaves. */
  async function bayoLeftAfterAnExpense() {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
    const [a, b, c] = people as [TestClient, TestClient, TestClient]
    const shared = await save(a, groupId, {
      title: 'Dinner',
      amountMinor: 3_000,
      paidBy: a.uid,
      splits: { [a.uid]: 1_500, [b.uid]: 1_500 },
    })
    const payback = await save(b, groupId, {
      title: 'Lunch',
      amountMinor: 3_000,
      paidBy: b.uid,
      splits: { [a.uid]: 1_500, [b.uid]: 1_500 },
    })
    await b.call('leaveGroup', { groupId })
    return { groupId, a, b, c, shared, payback }
  }

  it("keeps the expense intact with Bayo's uid, and his name in pastMembers for display", async () => {
    const { groupId, a, b, shared } = await bayoLeftAfterAnExpense()
    const group = await read(`groups/${groupId}`)
    expect(group?.pastMembers).toEqual({ [b.uid]: { displayName: 'Bayo' } })
    expect(group?.memberIds).not.toContain(b.uid)
    expect(await read(`groups/${groupId}/expenses/${shared.expenseId}`)).toMatchObject({
      paidBy: a.uid,
      splits: { [a.uid]: 1_500, [b.uid]: 1_500 },
    })
  })

  it('refuses to edit or delete it, naming who left, and leaves balances untouched', async () => {
    const { groupId, a, c, shared } = await bayoLeftAfterAnExpense()
    const before = await balancesOf(groupId)
    expect(before).toEqual({ [a.uid]: 0, [c.uid]: 0 })
    await expectCode(
      save(a, groupId, {
        expenseId: shared.expenseId,
        amountMinor: 3_000,
        paidBy: a.uid,
        splits: { [a.uid]: 3_000 },
      }),
      'failed-precondition',
      /Bayo has left the group, so this expense can no longer be changed\./,
    )
    await expectCode(
      a.call('deleteExpense', { groupId, expenseId: shared.expenseId }),
      'failed-precondition',
      /Bayo has left/,
    )
    expect(await balancesOf(groupId)).toEqual(before)
  })

  it("doesn't let a new expense include someone who left", async () => {
    const { groupId, a, b } = await bayoLeftAfterAnExpense()
    await expectCode(
      save(a, groupId, { amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 50, [b.uid]: 50 } }),
      'invalid-argument',
    )
  })

  it('lets the group carry on normally with everyone else', async () => {
    const { groupId, a, c } = await bayoLeftAfterAnExpense()
    await save(c, groupId, {
      amountMinor: 1_001,
      paidBy: c.uid,
      splits: { [a.uid]: 501, [c.uid]: 500 },
    })
    expect(await balancesOf(groupId)).toEqual({ [a.uid]: -501, [c.uid]: 501 })
  })
})

describe('receipts', () => {
  it('stores a receipt uploaded to the expense folder', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const expenseId = newId()
    const path = `receipts/${groupId}/${expenseId}/r1.jpg`
    await putFile(path)
    await save(a, groupId, {
      expenseId,
      amountMinor: 100,
      paidBy: a.uid,
      splits: { [a.uid]: 100 },
      receiptPath: path,
    })
    expect((await read(`groups/${groupId}/expenses/${expenseId}`))?.receiptPath).toBe(path)
  })

  it("refuses a receipt from another expense's folder, or one not uploaded", async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const expenseId = newId()
    await putFile(`receipts/${groupId}/other${'x'.repeat(15)}/r.jpg`)
    await expectCode(
      save(a, groupId, {
        expenseId,
        amountMinor: 1,
        paidBy: a.uid,
        splits: { [a.uid]: 1 },
        receiptPath: `receipts/${groupId}/other${'x'.repeat(15)}/r.jpg`,
      }),
      'invalid-argument',
    )
    await expectCode(
      save(a, groupId, {
        expenseId,
        amountMinor: 1,
        paidBy: a.uid,
        splits: { [a.uid]: 1 },
        receiptPath: `receipts/${groupId}/${expenseId}/missing.jpg`,
      }),
      'failed-precondition',
    )
  })

  it('deletes the old photo when it is replaced or removed, and all photos with the expense', async () => {
    const { groupId, people } = await setupGroup(['Ada'])
    const [a] = people as [TestClient]
    const expenseId = newId()
    const one = `receipts/${groupId}/${expenseId}/one.jpg`
    const two = `receipts/${groupId}/${expenseId}/two.jpg`
    await putFile(one)
    await putFile(two)
    const base = { expenseId, amountMinor: 100, paidBy: a.uid, splits: { [a.uid]: 100 } }
    await save(a, groupId, { ...base, receiptPath: one })
    await save(a, groupId, { ...base, receiptPath: two })
    expect(await fileExists(one)).toBe(false)
    await save(a, groupId, { ...base, receiptPath: null })
    expect(await fileExists(two)).toBe(false)

    const three = `receipts/${groupId}/${expenseId}/three.jpg`
    await putFile(three)
    await save(a, groupId, { ...base, receiptPath: three })
    await a.call('deleteExpense', { groupId, expenseId })
    expect(await fileExists(three)).toBe(false)
  })
})
