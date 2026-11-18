import { describe, expect, it } from 'vitest'
import { myEffect, peopleInExpense } from './types'

describe('myEffect', () => {
  const e = { amountMinor: 10_000, paidBy: 'ada', splits: { ada: 3_334, bayo: 3_333, chi: 3_333 } }
  it('is what others owe me when I paid', () => {
    expect(myEffect(e, 'ada')).toBe(6_666)
  })
  it('is minus my share when someone else paid', () => {
    expect(myEffect(e, 'bayo')).toBe(-3_333)
  })
  it('is zero when I am not in it at all', () => {
    expect(myEffect(e, 'dayo')).toBe(0)
  })
  it('is the whole amount when I paid for others only', () => {
    expect(myEffect({ amountMinor: 500, paidBy: 'ada', splits: { bayo: 500 } }, 'ada')).toBe(500)
  })
})

describe('peopleInExpense', () => {
  it('lists the payer and the split, once each', () => {
    expect(peopleInExpense({ paidBy: 'z', splits: { a: 1, z: 1 } }).sort()).toEqual(['a', 'z'])
  })
})
