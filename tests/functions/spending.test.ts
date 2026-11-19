import firebase from 'firebase/compat/app'
import { describe, expect, it } from 'vitest'
import { lastMonths } from '../../functions/src/lib/spending'
import { admin, client, expectCode, useEmulators, type TestClient } from './harness'
import { newId, save, setupGroup } from './scenario'

// spendingByMonth on the emulators: real expenses, my share only, per currency.
useEmulators()

const LAGOS = 'Africa/Lagos'
interface Spending {
  months: string[]
  byCurrency: Record<string, number[]>
}
const spending = (c: TestClient, months = 6) =>
  c.call('spendingByMonth', { timeZone: LAGOS, months }) as Promise<Spending>
const thisMonth = (s: Spending, currency: string) => s.byCurrency[currency]?.at(-1)

/** Ada, Bayo and Chi share an NGN group; Ada and Bayo also share a JPY group. */
async function twoCurrencies() {
  const ngn = await setupGroup(['Ada', 'Bayo', 'Chi'], 'NGN')
  const [a, b, c] = ngn.people as [TestClient, TestClient, TestClient]
  const { groupId: jpy } = (await a.call('createGroup', {
    name: 'Tokyo',
    currency: 'JPY',
    cover: 'trip',
  })) as {
    groupId: string
  }
  const { token } = (await a.call('createInvite', { groupId: jpy })) as { token: string }
  await b.call('acceptInvite', { token })
  return { ngn: ngn.groupId, jpy, a, b, c }
}

describe('spendingByMonth', () => {
  it('gives the last six months, oldest first, with a row for each of my currencies', async () => {
    const { a } = await twoCurrencies()
    const s = await spending(a)
    expect(s.months).toEqual(lastMonths(new Date(), LAGOS, 6))
    expect(s.byCurrency).toEqual({ NGN: [0, 0, 0, 0, 0, 0], JPY: [0, 0, 0, 0, 0, 0] })
  })

  it('counts only my share, in each currency, and yen as whole yen', async () => {
    const { ngn, jpy, a, b, c } = await twoCurrencies()
    // Bayo paid ₦100 for all three: Ada's share is ₦33.34 (the odd kobo goes first).
    await save(b, ngn, {
      amountMinor: 10_000,
      paidBy: b.uid,
      splits: { [a.uid]: 3_334, [b.uid]: 3_333, [c.uid]: 3_333 },
    })
    // ¥1,001 split between Ada and Bayo: Ada 501.
    await save(a, jpy, {
      amountMinor: 1_001,
      paidBy: a.uid,
      splits: { [a.uid]: 501, [b.uid]: 500 },
    })
    const s = await spending(a)
    expect(thisMonth(s, 'NGN')).toBe(3_334)
    expect(thisMonth(s, 'JPY')).toBe(501)
    // Each currency on its own: nothing was added across them or converted.
    expect(s.byCurrency.NGN?.slice(0, 5)).toEqual([0, 0, 0, 0, 0])
    expect(s.byCurrency.JPY?.slice(0, 5)).toEqual([0, 0, 0, 0, 0])
    // Bayo's own view counts his shares, not Ada's.
    const sb = await spending(b)
    expect(thisMonth(sb, 'NGN')).toBe(3_333)
    expect(thisMonth(sb, 'JPY')).toBe(500)
  })

  it('does not count expenses I paid for but am not part of', async () => {
    const { ngn, a, b, c } = await twoCurrencies()
    await save(a, ngn, {
      amountMinor: 5_000,
      paidBy: a.uid,
      splits: { [b.uid]: 2_500, [c.uid]: 2_500 },
    })
    expect(thisMonth(await spending(a), 'NGN')).toBe(0)
  })

  it('follows edits and deletes: it reads what the expenses say now', async () => {
    const { ngn, a, b } = await twoCurrencies()
    const { expenseId } = await save(a, ngn, {
      amountMinor: 1_000,
      paidBy: a.uid,
      splits: { [a.uid]: 500, [b.uid]: 500 },
    })
    await save(a, ngn, { amountMinor: 1_000, paidBy: a.uid, splits: { [b.uid]: 1_000 } })
    expect(thisMonth(await spending(a), 'NGN')).toBe(500)

    // Edit: Ada's share goes from ₦5 to ₦7.77.
    await save(a, ngn, {
      expenseId,
      amountMinor: 1_000,
      paidBy: a.uid,
      splits: { [a.uid]: 777, [b.uid]: 223 },
    })
    expect(thisMonth(await spending(a), 'NGN')).toBe(777)

    // Edit: Ada taken out of the split entirely.
    await save(a, ngn, { expenseId, amountMinor: 1_000, paidBy: a.uid, splits: { [b.uid]: 1_000 } })
    expect(thisMonth(await spending(a), 'NGN')).toBe(0)

    // Back in, then deleted.
    await save(a, ngn, {
      expenseId,
      amountMinor: 1_000,
      paidBy: a.uid,
      splits: { [a.uid]: 600, [b.uid]: 400 },
    })
    expect(thisMonth(await spending(a), 'NGN')).toBe(600)
    await a.call('deleteExpense', { groupId: ngn, expenseId })
    expect(thisMonth(await spending(a), 'NGN')).toBe(0)
  })

  it('puts older expenses in their own month, and leaves out anything before the window', async () => {
    const { ngn, a, b } = await twoCurrencies()
    const months = lastMonths(new Date(), LAGOS, 6)
    const mid = (key: string) => {
      const [y, m] = key.split('-').map(Number) as [number, number]
      return firebase.firestore.Timestamp.fromDate(new Date(Date.UTC(y, m - 1, 15, 12)))
    }
    const seed = (createdAt: firebase.firestore.Timestamp, share: number) =>
      admin((db) =>
        db.doc(`groups/${ngn}/expenses/${newId()}`).set({
          title: 'Older',
          amountMinor: share * 2,
          paidBy: b.uid,
          createdBy: b.uid,
          splits: { [a.uid]: share, [b.uid]: share },
          splitUserIds: [a.uid, b.uid],
          receiptPath: null,
          createdAt,
          updatedAt: createdAt,
        }),
      )
    await seed(mid(months[0] ?? ''), 1_111) // first month in the window
    await seed(mid(months[3] ?? ''), 2_222)
    await seed(firebase.firestore.Timestamp.fromMillis(Date.now() - 400 * 86_400_000), 9_999) // too old
    const s = await spending(a)
    expect(s.byCurrency.NGN).toEqual([1_111, 0, 0, 2_222, 0, 0])
  })

  it("doesn't count groups I'm not in", async () => {
    const { a } = await twoCurrencies()
    const other = await setupGroup(['Olu', 'Pam'], 'GBP')
    const [o] = other.people as [TestClient]
    // Even an expense that (wrongly) names Ada can't leak in: the group isn't hers.
    await admin((db) =>
      db.doc(`groups/${other.groupId}/expenses/${newId()}`).set({
        title: 'Not hers',
        amountMinor: 100,
        paidBy: o.uid,
        createdBy: o.uid,
        splits: { [a.uid]: 100 },
        splitUserIds: [a.uid],
        receiptPath: null,
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
      }),
    )
    const s = await spending(a)
    expect(Object.keys(s.byCurrency).sort()).toEqual(['JPY', 'NGN'])
  })

  it('refuses a signed-out caller, an unknown time zone and a silly number of months', async () => {
    const anon = await client({ signedOut: true })
    const a = await client({ profile: 'Ada' })
    await expectCode(anon.call('spendingByMonth', { timeZone: LAGOS }), 'unauthenticated')
    await expectCode(
      a.call('spendingByMonth', { timeZone: 'Mars/Olympus' }),
      'invalid-argument',
      /time zone/,
    )
    await expectCode(a.call('spendingByMonth', { timeZone: LAGOS, months: 40 }), 'invalid-argument')
  })
})
