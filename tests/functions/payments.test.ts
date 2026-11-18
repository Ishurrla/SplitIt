import { describe, expect, it } from 'vitest'
import { admin, client, expectCode, read, useEmulators, type TestClient } from './harness'
import { balancesOf, expectBalancesExact, newId, pay, save, setupGroup } from './scenario'

// settleUp, recordPayment and recomputeBalances on the emulators.
useEmulators()

interface Plan {
  currency: string
  balances: Record<string, number>
  transfers: { from: string; to: string; amountMinor: number }[]
}
const settleUp = (c: TestClient, groupId: string) =>
  c.call('settleUp', { groupId }) as Promise<Plan>

/** Ada paid ₦100 for Ada, Bayo and Chi: Ada +66.66, Bayo -33.33, Chi -33.33. */
async function suyaNight() {
  const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi'])
  const [a, b, c] = people as [TestClient, TestClient, TestClient]
  await save(a, groupId, {
    amountMinor: 10_000,
    paidBy: a.uid,
    splits: { [a.uid]: 3_334, [b.uid]: 3_333, [c.uid]: 3_333 },
  })
  return { groupId, a, b, c }
}

describe('settleUp', () => {
  it('returns the currency, the balances and the fewest payments, debtors in uid order on ties', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const plan = await settleUp(b, groupId)
    expect(plan.currency).toBe('NGN')
    expect(plan.balances).toEqual({ [a.uid]: 6_666, [b.uid]: -3_333, [c.uid]: -3_333 })
    const [first, second] = [b.uid, c.uid].sort()
    expect(plan.transfers).toEqual([
      { from: first, to: a.uid, amountMinor: 3_333 },
      { from: second, to: a.uid, amountMinor: 3_333 },
    ])
  })

  it('gives every member the same plan, every time', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const plans = await Promise.all([
      settleUp(a, groupId),
      settleUp(b, groupId),
      settleUp(c, groupId),
      settleUp(a, groupId),
    ])
    for (const p of plans) expect(p).toEqual(plans[0])
  })

  it('answers permission-denied to an outsider, the same for a group that does not exist', async () => {
    const { groupId } = await suyaNight()
    const outsider = await client({ profile: 'Olu' })
    await expectCode(settleUp(outsider, groupId), 'permission-denied')
    await expectCode(settleUp(outsider, 'noSuchGroup'), 'permission-denied')
    await expectCode(settleUp(await client({ signedOut: true }), groupId), 'unauthenticated')
  })

  it('is empty once everyone has paid what the plan says', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const byUid = new Map([a, b, c].map((p) => [p.uid, p]))
    for (const t of (await settleUp(a, groupId)).transfers) {
      const payer = byUid.get(t.from)
      if (!payer) throw new Error('The plan names someone outside the group')
      await pay(payer, groupId, t.from, t.to, t.amountMinor)
    }
    const after = await settleUp(a, groupId)
    expect(after.transfers).toEqual([])
    expect(Object.values(after.balances).every((v) => v === 0)).toBe(true)
    await expectBalancesExact(groupId)
  })
})
describe('recordPayment', () => {
  it('records a full payment: payer back to zero, receiver owed less, a payment and an activity entry', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const { paymentId } = await pay(b, groupId, b, a, 3_333)
    await expectBalancesExact(groupId, { [a.uid]: 3_333, [b.uid]: 0, [c.uid]: -3_333 })
    expect(await read(`groups/${groupId}/payments/${paymentId}`)).toMatchObject({
      from: b.uid,
      to: a.uid,
      amountMinor: 3_333,
      createdBy: b.uid,
    })
    const kinds = await admin(async (db) =>
      (await db.collection(`groups/${groupId}/activity`).get()).docs.map((d) => d.data()),
    )
    expect(kinds.find((k) => k.kind === 'payment.recorded')).toMatchObject({
      payload: { from: b.uid, to: a.uid, amountMinor: 3_333 },
    })
  })

  it('records partial payments, and the receiver can record one too', async () => {
    const { groupId, a, b, c } = await suyaNight()
    await pay(b, groupId, b, a, 1_000)
    await pay(a, groupId, b, a, 2_000) // Ada marks money she received
    await expectBalancesExact(groupId, { [a.uid]: 3_666, [b.uid]: -333, [c.uid]: -3_333 })
    await pay(b, groupId, b, a, 333)
    expect((await balancesOf(groupId))[b.uid]).toBe(0)
  })

  it('never lets a payment exceed what is owed, and says the most it can be', async () => {
    const { groupId, a, b } = await suyaNight()
    const before = await balancesOf(groupId)
    await expectCode(
      pay(b, groupId, b, a, 3_334),
      'failed-precondition',
      /The most you can record is ₦33\.33\./,
    )
    await pay(b, groupId, b, a, 3_000)
    await expectCode(
      pay(b, groupId, b, a, 334),
      'failed-precondition',
      /The most you can record is ₦3\.33\./,
    )
    expect((await balancesOf(groupId))[b.uid]).toBe((before[b.uid] as number) + 3_000)
  })

  it('refuses to pay someone who is not owed, or from someone who owes nothing', async () => {
    const { groupId, a, b, c } = await suyaNight()
    await expectCode(pay(b, groupId, b, c, 100), 'failed-precondition', /doesn't owe .* anything/) // Chi is owed nothing
    await expectCode(pay(a, groupId, a, b, 100), 'failed-precondition') // Ada owes nothing
    await expectBalancesExact(groupId, { [a.uid]: 6_666, [b.uid]: -3_333, [c.uid]: -3_333 })
  })

  it('lets only the payer or the receiver record it', async () => {
    const { groupId, a, b, c } = await suyaNight()
    await expectCode(
      pay(c, groupId, b, a, 100),
      'permission-denied',
      /person who paid or the person who was paid/,
    )
    const outsider = await client({ profile: 'Olu' })
    await expectCode(pay(outsider, groupId, outsider, a, 100), 'permission-denied')
  })

  it('refuses paying yourself, a non-member, fractions and zero', async () => {
    const { groupId, a, b } = await suyaNight()
    await expectCode(pay(b, groupId, b, b, 100), 'invalid-argument', /cannot pay themselves/)
    const outsider = await client({ profile: 'Olu' })
    await expectCode(pay(b, groupId, b, outsider.uid, 100), 'invalid-argument', /in the group/)
    await expectCode(pay(b, groupId, b, a, 10.5), 'invalid-argument')
    await expectCode(pay(b, groupId, b, a, 0), 'invalid-argument')
  })

  it('cannot overpay when the same full payment is recorded several times at once', async () => {
    // Bayo and Ada each record Bayo's ₦33.33 three times, all at once, in three fresh groups.
    // The functions emulator handled the first burst of calls one at a time, so a single round
    // could not catch a missing transaction (checked: it passed with the transaction removed).
    // Later rounds really do overlap.
    for (let round = 0; round < 3; round++) {
      const { groupId, a, b, c } = await suyaNight()
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => pay(i % 2 ? a : b, groupId, b, a, 3_333)),
      )
      expect(
        results.filter((r) => r.status === 'fulfilled'),
        `round ${round}`,
      ).toHaveLength(1)
      for (const r of results) {
        if (r.status === 'rejected') {
          expect((r.reason as { code: string }).code).toBe('functions/failed-precondition')
        }
      }
      await expectBalancesExact(groupId, { [a.uid]: 3_333, [b.uid]: 0, [c.uid]: -3_333 })
      const count = await admin(
        async (db) => (await db.collection(`groups/${groupId}/payments`).get()).size,
      )
      expect(count).toBe(1)
    }
  })

  // Runs after the multi-round test above, when the emulator handles calls in parallel.
  it('two payments recorded at the same moment: exactly one goes through', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const results = await Promise.allSettled([
      pay(b, groupId, b, a, 3_333),
      pay(a, groupId, b, a, 3_333),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expectBalancesExact(groupId, { [a.uid]: 3_333, [b.uid]: 0, [c.uid]: -3_333 })
    const count = await admin(
      async (db) => (await db.collection(`groups/${groupId}/payments`).get()).size,
    )
    expect(count).toBe(1)
  })

  it('cannot overpay with partial payments racing either', async () => {
    const { groupId, a, b, c } = await suyaNight()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => pay(i % 2 ? a : b, groupId, b, a, 1_000)),
    )
    // Only three ₦10 payments fit in a ₦33.33 debt.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    await expectBalancesExact(groupId, { [a.uid]: 3_666, [b.uid]: -333, [c.uid]: -3_333 })
  })
})

describe('people who left (pastMembers)', () => {
  /** Bayo pays his share and leaves; Ada is still owed by Chi. */
  async function bayoPaidAndLeft() {
    const { groupId, a, b, c } = await suyaNight()
    await pay(b, groupId, b, a, 3_333)
    await b.call('leaveGroup', { groupId })
    return { groupId, a, b, c }
  }

  it('settleUp leaves them out of the balances and the plan', async () => {
    const { groupId, a, b, c } = await bayoPaidAndLeft()
    const plan = await settleUp(a, groupId)
    expect(Object.keys(plan.balances).sort()).toEqual([a.uid, c.uid].sort())
    expect(plan.transfers).toEqual([{ from: c.uid, to: a.uid, amountMinor: 3_333 }])
    expect(JSON.stringify(plan)).not.toContain(b.uid)
  })

  it('no payment can involve them', async () => {
    const { groupId, a, b } = await bayoPaidAndLeft()
    await expectCode(pay(a, groupId, b.uid, a, 1), 'invalid-argument', /in the group/)
    await expectCode(pay(b, groupId, b, a, 1), 'permission-denied') // and they can't call at all
  })

  it('recomputeBalances still matches, with their expense and payment in the history', async () => {
    const { groupId, a, c } = await bayoPaidAndLeft()
    const result = (await a.call('recomputeBalances', { groupId })) as {
      balances: object
      changed: boolean
    }
    expect(result).toMatchObject({ changed: false, balances: { [a.uid]: 3_333, [c.uid]: -3_333 } })
  })
})

describe('recomputeBalances', () => {
  it('matches the stored balances after a mix of expenses, edits, deletes and payments', async () => {
    const { groupId, people } = await setupGroup(['Ada', 'Bayo', 'Chi', 'Dayo'])
    const [a, b, c, d] = people as [TestClient, TestClient, TestClient, TestClient]

    const e1 = await save(a, groupId, {
      amountMinor: 10_000,
      paidBy: a.uid,
      splits: { [a.uid]: 2_500, [b.uid]: 2_500, [c.uid]: 2_500, [d.uid]: 2_500 },
    })
    const e2 = await save(b, groupId, {
      amountMinor: 9_001,
      paidBy: b.uid,
      splits: { [b.uid]: 3_001, [c.uid]: 3_000, [d.uid]: 3_000 },
    })
    await save(c, groupId, {
      amountMinor: 777,
      paidBy: d.uid,
      splits: { [a.uid]: 700, [c.uid]: 77 },
    })
    await save(a, groupId, {
      expenseId: e1.expenseId,
      amountMinor: 12_345,
      paidBy: c.uid,
      splits: { [a.uid]: 12_000, [d.uid]: 345 },
    })
    await pay(d, groupId, d, b, 2_000)
    await b.call('deleteExpense', { groupId, expenseId: e2.expenseId })
    const e4 = await save(d, groupId, {
      amountMinor: 50_000,
      paidBy: d.uid,
      splits: { [a.uid]: 16_667, [b.uid]: 16_667, [c.uid]: 16_666 },
    })
    await pay(a, groupId, a, d, 16_667)
    await pay(b, groupId, b, d, 5_000)
    await save(d, groupId, {
      expenseId: e4.expenseId,
      amountMinor: 40_000,
      paidBy: d.uid,
      splits: { [a.uid]: 20_000, [b.uid]: 20_000 },
    })

    const stored = await balancesOf(groupId)
    await expectBalancesExact(groupId)
    const result = (await a.call('recomputeBalances', { groupId })) as {
      balances: Record<string, number>
      changed: boolean
      expenses: number
      payments: number
    }
    expect(result).toEqual({ balances: stored, changed: false, expenses: 3, payments: 3 })
    expect(await balancesOf(groupId)).toEqual(stored)
  })

  it('repairs balances that were changed behind its back, and logs it', async () => {
    const { groupId, a, b, c } = await suyaNight()
    await admin((db) =>
      db.doc(`groups/${groupId}`).update({ balances: { [a.uid]: 0, [b.uid]: 5, [c.uid]: -5 } }),
    )
    const result = (await a.call('recomputeBalances', { groupId })) as { changed: boolean }
    expect(result.changed).toBe(true)
    expect(await balancesOf(groupId)).toEqual({ [a.uid]: 6_666, [b.uid]: -3_333, [c.uid]: -3_333 })
    const kinds = await admin(async (db) =>
      (await db.collection(`groups/${groupId}/activity`).get()).docs.map(
        (d) => d.get('kind') as string,
      ),
    )
    expect(kinds).toContain('balances.recomputed')
  })

  it('refuses rather than leave money with someone who is no longer a member', async () => {
    const { groupId, a } = await suyaNight()
    const before = await balancesOf(groupId)
    await admin((db) =>
      db.doc(`groups/${groupId}/expenses/${newId()}`).set({
        title: 'Planted',
        amountMinor: 100,
        paidBy: a.uid,
        createdBy: a.uid,
        splits: { ghost: 100 },
        splitUserIds: ['ghost'],
        receiptPath: null,
      }),
    )
    await expectCode(
      a.call('recomputeBalances', { groupId }),
      'failed-precondition',
      /someone who has left/,
    )
    expect(await balancesOf(groupId)).toEqual(before)
  })

  it('is for the owner only', async () => {
    const { groupId, b } = await suyaNight()
    await expectCode(b.call('recomputeBalances', { groupId }), 'permission-denied', /owner/)
  })
})
