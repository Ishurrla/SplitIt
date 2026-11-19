import { describe, expect, it } from 'vitest'
import { compactMinor, niceTop } from './chartScale'

describe('niceTop', () => {
  it('rounds up to a nice number of whole units', () => {
    expect(niceTop(7_230_000, 'NGN')).toBe(8_000_000) // ₦72,300 -> ₦80,000
    expect(niceTop(4_800_000, 'NGN')).toBe(5_000_000) // ₦48,000 -> ₦50,000
    expect(niceTop(1_100_000, 'NGN')).toBe(1_200_000) // ₦11,000 -> ₦12,000
    expect(niceTop(45_000, 'JPY')).toBe(50_000)
  })

  it('is never below the value and always a whole number', () => {
    for (const v of [1, 99, 100, 101, 12_345, 999_999, 10_000_001, 123_456_789]) {
      const top = niceTop(v, 'USD')
      expect(top).toBeGreaterThanOrEqual(v)
      expect(Number.isSafeInteger(top)).toBe(true)
    }
  })

  it('shows at least one whole unit when there was no spending', () => {
    expect(niceTop(0, 'NGN')).toBe(100)
    expect(niceTop(0, 'JPY')).toBe(1)
  })
})

describe('compactMinor', () => {
  it('writes short labels like the prototype', () => {
    expect(compactMinor(4_800_000, 'NGN')).toBe('₦48k')
    expect(compactMinor(4_850_000, 'NGN')).toBe('₦48.5k')
    expect(compactMinor(120_000_000, 'NGN')).toBe('₦1.2M')
    expect(compactMinor(35_000, 'GBP')).toBe('£350')
    expect(compactMinor(4_500, 'JPY')).toBe('¥4.5k')
    expect(compactMinor(0, 'USD')).toBe('$0')
  })
})
