import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_CODES,
  MAX_AMOUNT_MINOR,
  amountProblem,
  isCurrencyCode,
  isValidAmountMinor,
} from './money'

describe('currency table', () => {
  it('has exactly the nine supported currencies', () => {
    expect(CURRENCY_CODES).toEqual(['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'CAD', 'JPY'])
  })

  it('gives yen no minor unit and the others two decimals', () => {
    expect(CURRENCIES.JPY.exponent).toBe(0)
    for (const code of CURRENCY_CODES.filter((c) => c !== 'JPY')) {
      expect(CURRENCIES[code].exponent).toBe(2)
    }
  })

  it('recognises codes and rejects anything else', () => {
    expect(isCurrencyCode('NGN')).toBe(true)
    expect(isCurrencyCode('ngn')).toBe(false)
    expect(isCurrencyCode('BTC')).toBe(false)
    expect(isCurrencyCode('toString')).toBe(false) // not fooled by Object.prototype
    expect(isCurrencyCode(undefined)).toBe(false)
  })
})

describe('amountProblem', () => {
  it('accepts positive whole numbers up to the limit', () => {
    expect(amountProblem(1)).toBeNull()
    expect(amountProblem(1_860_000)).toBeNull()
    expect(amountProblem(MAX_AMOUNT_MINOR)).toBeNull()
  })

  it('rejects non-integers', () => {
    expect(amountProblem(12.5)).toBe('not-integer')
    expect(amountProblem(0.1 + 0.2)).toBe('not-integer')
    expect(amountProblem(Number.NaN)).toBe('not-integer')
    expect(amountProblem(Number.POSITIVE_INFINITY)).toBe('not-integer')
    expect(amountProblem('100')).toBe('not-integer')
    expect(amountProblem(null)).toBe('not-integer')
  })

  it('rejects zero and negatives', () => {
    expect(amountProblem(0)).toBe('not-positive')
    expect(amountProblem(-0)).toBe('not-positive')
    expect(amountProblem(-500)).toBe('not-positive')
  })

  it('rejects absurdly large values', () => {
    expect(amountProblem(MAX_AMOUNT_MINOR + 1)).toBe('too-large')
    expect(amountProblem(Number.MAX_SAFE_INTEGER)).toBe('too-large')
    expect(amountProblem(2 ** 60)).toBe('not-integer') // beyond safe integers
  })

  it('isValidAmountMinor agrees', () => {
    expect(isValidAmountMinor(500)).toBe(true)
    expect(isValidAmountMinor(0)).toBe(false)
  })
})
