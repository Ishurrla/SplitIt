import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_CODES,
  MAX_AMOUNT_MINOR,
  amountProblem,
  formatMinor,
  isCurrencyCode,
  isValidAmountMinor,
  parseAmount,
  splitEqually,
  toAmountInput,
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

describe('parseAmount', () => {
  const minor = (text: string, currency: Parameters<typeof parseAmount>[1] = 'NGN') => {
    const r = parseAmount(text, currency)
    return r.ok ? r.minor : r.message
  }

  it('reads grouped thousands with decimals, like 1,250.50', () => {
    expect(minor('1,250.50')).toBe(125_050)
    expect(minor('1,250,000')).toBe(125_000_000)
    expect(minor('35650')).toBe(3_565_000)
  })

  it('ignores the currency symbol and spaces', () => {
    expect(minor('₦35,650')).toBe(3_565_000)
    expect(minor(' 1 250.5 ')).toBe(125_050)
    expect(minor('£12.30', 'GBP')).toBe(1_230)
    expect(minor('GH₵10', 'GHS')).toBe(1_000)
  })

  it('pads one decimal and accepts a leading or trailing point', () => {
    expect(minor('12.5')).toBe(1_250)
    expect(minor('.5', 'USD')).toBe(50)
    expect(minor('7.', 'USD')).toBe(700)
  })

  it('never goes through floats: 0.1 + 0.2 style amounts stay exact', () => {
    expect((minor('0.10', 'USD') as number) + (minor('0.20', 'USD') as number)).toBe(30)
    expect(minor('1234567.89', 'EUR')).toBe(123_456_789)
  })

  it('reads yen as whole yen and refuses decimals', () => {
    expect(minor('1,500', 'JPY')).toBe(1_500)
    expect(minor('¥45000', 'JPY')).toBe(45_000)
    expect(minor('1500.5', 'JPY')).toMatch(/Yen has no decimals/)
    expect(minor('1500.', 'JPY')).toMatch(/Yen has no decimals/)
  })

  it('refuses too many decimals, bad grouping, letters and negatives', () => {
    expect(minor('1.234')).toMatch(/at most 2 decimals/)
    expect(minor('1,25.50')).toMatch(/like 1,250.50/)
    expect(minor('12,3456')).toMatch(/like 1,250.50/)
    expect(minor('1e5')).toMatch(/like 1,250.50/)
    expect(minor('abc')).toMatch(/like 1,250.50/)
    expect(minor('-5')).toMatch(/negative/)
    expect(minor('1.2.3')).toMatch(/like 1,250.50/)
  })

  it('refuses empty, zero and absurd amounts unless zero is allowed', () => {
    expect(minor('')).toMatch(/Enter an amount/)
    expect(minor('0.00')).toMatch(/above zero/)
    expect(minor('1,000,000,001')).toMatch(/too large/) // ₦1bn + 1 naira
    expect(minor('99999999999999999999')).toMatch(/too large/)
    expect(parseAmount('', 'NGN', { allowZero: true })).toEqual({ ok: true, minor: 0 })
    expect(parseAmount('0', 'NGN', { allowZero: true })).toEqual({ ok: true, minor: 0 })
  })

  it('accepts exactly the limit', () => {
    expect(minor('1,000,000,000')).toBe(MAX_AMOUNT_MINOR)
  })
})

describe('toAmountInput', () => {
  it('turns minor units back into editable text', () => {
    expect(toAmountInput(125_050, 'NGN')).toBe('1250.50')
    expect(toAmountInput(3_565_000, 'NGN')).toBe('35650')
    expect(toAmountInput(5, 'USD')).toBe('0.05')
    expect(toAmountInput(45_000, 'JPY')).toBe('45000')
  })

  it('round-trips through parseAmount', () => {
    for (const [value, currency] of [
      [1, 'NGN'],
      [125_050, 'GBP'],
      [99, 'USD'],
      [1_234_567, 'JPY'],
    ] as const) {
      expect(parseAmount(toAmountInput(value, currency), currency)).toEqual({
        ok: true,
        minor: value,
      })
    }
  })
})

describe('splitEqually', () => {
  it('splits a 3-way amount that does not divide evenly, extra kobo to the first people', () => {
    expect(splitEqually(10_000, ['a', 'b', 'c'])).toEqual({ a: 3_334, b: 3_333, c: 3_333 })
    expect(splitEqually(10_001, ['a', 'b', 'c'])).toEqual({ a: 3_334, b: 3_334, c: 3_333 })
  })

  it('always adds up exactly to the total', () => {
    for (const total of [1, 2, 7, 100, 10_001, 3_565_050, MAX_AMOUNT_MINOR]) {
      for (let n = 1; n <= 7; n++) {
        const uids = Array.from({ length: n }, (_, i) => `u${i}`)
        const shares = Object.values(splitEqually(total, uids))
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
        expect(shares.every(Number.isSafeInteger)).toBe(true)
      }
    }
  })

  it('splits yen the same way, in whole yen', () => {
    expect(splitEqually(1_000, ['a', 'b', 'c'])).toEqual({ a: 334, b: 333, c: 333 })
  })

  it('depends on the order given, so the same people in the same order always get the same shares', () => {
    expect(splitEqually(100, ['c', 'a', 'b'])).toEqual({ c: 34, a: 33, b: 33 })
  })

  it('refuses nobody', () => {
    expect(() => splitEqually(100, [])).toThrow(RangeError)
  })
})

describe('isValidAmountMinor', () => {
  it('agrees with amountProblem', () => {
    expect(isValidAmountMinor(500)).toBe(true)
    expect(isValidAmountMinor(0)).toBe(false)
  })
})
