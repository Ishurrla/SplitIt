import { describe, expect, it } from 'vitest'
import { bucketSpending, isTimeZone, lastMonths, monthKey } from './spending.js'

const LAGOS = 'Africa/Lagos' // UTC+1 all year
const months = ['2026-09', '2026-10', '2026-11']
const at = (iso: string) => new Date(iso)

describe('monthKey and lastMonths', () => {
  it('uses the time zone for month edges', () => {
    // 23:30 UTC on 31 Oct is 00:30 on 1 Nov in Lagos.
    expect(monthKey(at('2026-10-31T23:30:00Z'), LAGOS)).toBe('2026-11')
    expect(monthKey(at('2026-10-31T23:30:00Z'), 'UTC')).toBe('2026-10')
  })

  it('lists the last months oldest first, across a year end', () => {
    expect(lastMonths(at('2026-11-18T12:00:00Z'), LAGOS, 6)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(lastMonths(at('2027-02-10T12:00:00Z'), LAGOS, 4)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
  })

  it('recognises real time zones only', () => {
    expect(isTimeZone(LAGOS)).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('bucketSpending', () => {
  it('counts only my share, never the whole amount', () => {
    const out = bucketSpending(
      [
        {
          currency: 'NGN',
          createdAt: at('2026-11-05T10:00:00Z'),
          splits: { me: 3_334, ada: 3_333, bayo: 3_333 },
        },
      ],
      'me',
      months,
      LAGOS,
      ['NGN'],
    )
    expect(out).toEqual({ NGN: [0, 0, 3_334] })
  })

  it('ignores expenses I am not in, even ones I paid for', () => {
    // Paying isn't spending: I paid for Ada and Bayo, my share is nothing.
    const out = bucketSpending(
      [{ currency: 'NGN', createdAt: at('2026-11-05T10:00:00Z'), splits: { ada: 500, bayo: 500 } }],
      'me',
      months,
      LAGOS,
      ['NGN'],
    )
    expect(out).toEqual({ NGN: [0, 0, 0] })
  })

  it('keeps each currency apart and never converts', () => {
    const out = bucketSpending(
      [
        { currency: 'NGN', createdAt: at('2026-10-02T10:00:00Z'), splits: { me: 1_860_000 } },
        { currency: 'GBP', createdAt: at('2026-10-03T10:00:00Z'), splits: { me: 1_500 } },
        { currency: 'NGN', createdAt: at('2026-10-20T10:00:00Z'), splits: { me: 40_000 } },
      ],
      'me',
      months,
      LAGOS,
      ['NGN', 'GBP'],
    )
    expect(out).toEqual({ NGN: [0, 1_900_000, 0], GBP: [0, 1_500, 0] })
  })

  it('adds yen as whole yen', () => {
    const out = bucketSpending(
      [
        {
          currency: 'JPY',
          createdAt: at('2026-09-10T03:00:00Z'),
          splits: { me: 334, a: 333, b: 333 },
        },
        { currency: 'JPY', createdAt: at('2026-09-25T03:00:00Z'), splits: { me: 4_500 } },
      ],
      'me',
      months,
      LAGOS,
      ['JPY'],
    )
    expect(out).toEqual({ JPY: [4_834, 0, 0] })
    expect(out.JPY?.every(Number.isSafeInteger)).toBe(true)
  })

  it('files an expense by its month in my time zone', () => {
    const late = { currency: 'NGN', createdAt: at('2026-10-31T23:30:00Z'), splits: { me: 100 } }
    expect(bucketSpending([late], 'me', months, LAGOS, ['NGN'])).toEqual({ NGN: [0, 0, 100] })
    expect(bucketSpending([late], 'me', months, 'UTC', ['NGN'])).toEqual({ NGN: [0, 100, 0] })
  })

  it('ignores months outside the window, and lists currencies with no spending as zeros', () => {
    const old = { currency: 'NGN', createdAt: at('2025-01-01T10:00:00Z'), splits: { me: 999 } }
    expect(bucketSpending([old], 'me', months, LAGOS, ['NGN', 'USD'])).toEqual({
      NGN: [0, 0, 0],
      USD: [0, 0, 0],
    })
  })
})
