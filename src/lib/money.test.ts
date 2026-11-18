import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_CODES,
  MAX_AMOUNT_MINOR,
  amountProblem,
  formatMinor,
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
  })
})

describe('formatMinor', () => {
  it('drops .00 and groups thousands, like the prototype', () => {
    expect(formatMinor(3_565_000, 'NGN')).toBe('₦35,650')
    expect(formatMinor(22_260_000, 'NGN')).toBe('₦222,600')
  })

  it('keeps a non-zero fraction with both digits', () => {
    expect(formatMinor(3_565_050, 'NGN')).toBe('₦35,650.50')
    expect(formatMinor(5, 'USD')).toBe('$0.05')
    expect(formatMinor(125_050, 'GBP')).toBe('£1,250.50')
  })

  it('has no decimals for yen', () => {
    expect(formatMinor(1_234_567, 'JPY')).toBe('¥1,234,567')
  })

  it('handles zero and negatives', () => {
    expect(formatMinor(0, 'EUR')).toBe('€0')
    expect(formatMinor(-1_050, 'GHS')).toBe('-GH₵10.50')
  })

  it('refuses non-integers', () => {
    expect(() => formatMinor(10.5, 'NGN')).toThrow(RangeError)
  })
})

describe('isValidAmountMinor', () => {
  it('agrees with amountProblem', () => {
    expect(isValidAmountMinor(500)).toBe(true)
    expect(isValidAmountMinor(0)).toBe(false)
  })
})
