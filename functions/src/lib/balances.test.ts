import { describe, expect, it } from 'vitest'
import { splitEqually } from './money.js'
import {
  applyEffect,
  expenseEffect,
  peopleIn,
  rebalance,
  total,
  type ExpenseMoney,
} from './balances.js'

const zero = { a: 0, b: 0, c: 0, d: 0 }
const suya: ExpenseMoney = {
  amountMinor: 10_000,
  paidBy: 'a',
  splits: splitEqually(10_000, ['a', 'b', 'c']),
}

describe('expenseEffect', () => {
  it('credits the payer the amount and debits each share', () => {
    expect(expenseEffect(suya)).toEqual({ a: 10_000 - 3_334, b: -3_333, c: -3_333 })
  })

  it('works when the payer is not in the split', () => {
    expect(expenseEffect({ amountMinor: 500, paidBy: 'd', splits: { a: 250, b: 250 } })).toEqual({
      d: 500,
      a: -250,
      b: -250,
    })
  })

  it('always nets to zero', () => {
    expect(total(expenseEffect(suya))).toBe(0)
  })
})

describe('rebalance', () => {
  it('adds a new expense', () => {
    expect(rebalance(zero, null, suya)).toEqual({ a: 6_666, b: -3_333, c: -3_333, d: 0 })
  })

  it('editing amount and people applies only the difference', () => {
    const start = rebalance(zero, null, suya)
    const edited: ExpenseMoney = {
      amountMinor: 9_001,
      paidBy: 'b',
      splits: splitEqually(9_001, ['b', 'c', 'd']),
    }
    const after = rebalance(start, suya, edited)
    // Same as if the edited expense had been the only one all along.
    expect(after).toEqual(rebalance(zero, null, edited))
    expect(after).toEqual({ a: 0, b: 9_001 - 3_001, c: -3_000, d: -3_000 })
    expect(total(after)).toBe(0)
  })

  it('deleting takes the expense back out exactly', () => {
    const other: ExpenseMoney = { amountMinor: 777, paidBy: 'c', splits: { a: 700, d: 77 } }
    const both = rebalance(rebalance(zero, null, suya), null, other)
    expect(rebalance(both, suya, null)).toEqual(rebalance(zero, null, other))
  })

  it('stays at zero total over many random edits and deletes', () => {
    const people = ['a', 'b', 'c', 'd']
    let balances: Record<string, number> = { ...zero }
    const live: ExpenseMoney[] = []
    let seed = 42
    const rand = (n: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) % n
    for (let step = 0; step < 500; step++) {
      const action = rand(3)
      const who = people.filter(() => rand(2) === 1)
      const split = who.length ? who : ['a']
      const amount = 1 + rand(1_000_000)
      const next: ExpenseMoney = {
        amountMinor: amount,
        paidBy: people[rand(4)] ?? 'a',
        splits: splitEqually(amount, split),
      }
      if (action === 0 || live.length === 0) {
        balances = rebalance(balances, null, next)
        live.push(next)
      } else {
        const i = rand(live.length)
        const old = live[i] as ExpenseMoney
        if (action === 1) {
          balances = rebalance(balances, old, next)
          live[i] = next
        } else {
          balances = rebalance(balances, old, null)
          live.splice(i, 1)
        }
      }
      expect(total(balances)).toBe(0)
    }
    // And the running result equals rebuilding from the surviving expenses.
    const rebuilt = live.reduce<Record<string, number>>((b, e) => rebalance(b, null, e), {
      ...zero,
    })
    expect(balances).toEqual(rebuilt)
  })
})

describe('applyEffect and peopleIn', () => {
  it('does not change its input', () => {
    const before = { a: 1 }
    applyEffect(before, { a: 5 }, 1)
    expect(before).toEqual({ a: 1 })
  })

  it('lists payer and split people once each', () => {
    expect(peopleIn(suya).sort()).toEqual(['a', 'b', 'c'])
    expect(peopleIn({ amountMinor: 1, paidBy: 'z', splits: { a: 1 } }).sort()).toEqual(['a', 'z'])
  })
})
