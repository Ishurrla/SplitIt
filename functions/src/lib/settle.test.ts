import { describe, expect, it } from 'vitest'
import { settle, type Transfer } from './settle.js'

/** Balances after everyone makes their payments: must all be zero. */
function afterPaying(
  balances: Record<string, number>,
  transfers: Transfer[],
): Record<string, number> {
  const out = { ...balances }
  for (const t of transfers) {
    out[t.from] = (out[t.from] ?? 0) + t.amountMinor
    out[t.to] = (out[t.to] ?? 0) - t.amountMinor
  }
  return out
}

/** Small seeded generator, so a failure can be reproduced. */
function rng(seed: number) {
  let s = seed
  return (n: number) => {
    s = (s * 1_103_515_245 + 12_345) % 2 ** 31
    return s % n
  }
}

/** Random integer balances for n people that add up to zero. */
function randomBalances(
  rand: (n: number) => number,
  n: number,
  scale: number,
): Record<string, number> {
  const uids = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, '0')}`)
  const values = uids.map(() => rand(2 * scale + 1) - scale)
  const sum = values.reduce((a, b) => a + b, 0)
  values[n - 1] = (values[n - 1] ?? 0) - sum
  return Object.fromEntries(uids.map((u, i) => [u, values[i] ?? 0]))
}

describe('settle: worked examples', () => {
  it('pays the biggest creditor from the biggest debtor first', () => {
    expect(settle({ ada: 15_000, bayo: -10_000, chi: -5_000 })).toEqual([
      { from: 'bayo', to: 'ada', amountMinor: 10_000 },
      { from: 'chi', to: 'ada', amountMinor: 5_000 },
    ])
  })

  it('needs nothing when everyone is square', () => {
    expect(settle({ a: 0, b: 0 })).toEqual([])
    expect(settle({})).toEqual([])
  })

  it('handles one debtor and several creditors', () => {
    expect(settle({ a: -9, b: 4, c: 3, d: 2 })).toEqual([
      { from: 'a', to: 'b', amountMinor: 4 },
      { from: 'a', to: 'c', amountMinor: 3 },
      { from: 'a', to: 'd', amountMinor: 2 },
    ])
  })

  it('breaks ties by uid, whatever order the balances arrive in', () => {
    const plan = settle({ b: 500, a: 500, d: -500, c: -500 })
    expect(plan).toEqual([
      { from: 'c', to: 'a', amountMinor: 500 },
      { from: 'd', to: 'b', amountMinor: 500 },
    ])
    expect(settle({ c: -500, d: -500, a: 500, b: 500 })).toEqual(plan)
  })

  it('refuses balances that do not add up to zero, or are not whole numbers', () => {
    expect(() => settle({ a: 5, b: -4 })).toThrow(RangeError)
    expect(() => settle({ a: 0.5, b: -0.5 })).toThrow(RangeError)
  })
})

describe('settle: properties over 2000 random groups', () => {
  const rand = rng(20_261_118)
  const cases = Array.from({ length: 2_000 }, (_, i) =>
    randomBalances(rand, 1 + (i % 12), i % 3 === 0 ? 9 : 5_000_000),
  )

  it('clears every person to exactly zero', () => {
    for (const balances of cases) {
      const after = afterPaying(balances, settle(balances))
      expect(Object.values(after).every((v) => v === 0)).toBe(true)
    }
  })

  it('uses only positive whole amounts between two different people', () => {
    for (const balances of cases) {
      for (const t of settle(balances)) {
        expect(Number.isSafeInteger(t.amountMinor)).toBe(true)
        expect(t.amountMinor).toBeGreaterThan(0)
        expect(t.from).not.toBe(t.to)
        expect(balances[t.from]).toBeLessThan(0) // only debtors pay
        expect(balances[t.to]).toBeGreaterThan(0) // only creditors receive
      }
    }
  })

  it('needs at most n - 1 payments, n being the people not already at zero', () => {
    for (const balances of cases) {
      const n = Object.values(balances).filter((v) => v !== 0).length
      expect(settle(balances).length).toBeLessThanOrEqual(Math.max(0, n - 1))
    }
  })

  it('gives the same plan for the same balances in any order (ties included)', () => {
    const shuffle = rng(7)
    for (const balances of cases) {
      const entries = Object.entries(balances)
      for (let i = entries.length - 1; i > 0; i--) {
        const j = shuffle(i + 1)
        ;[entries[i], entries[j]] = [entries[j] as [string, number], entries[i] as [string, number]]
      }
      expect(settle(Object.fromEntries(entries))).toEqual(settle(balances))
    }
  })
})
