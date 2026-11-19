import { describe, expect, it } from 'vitest'
import { totalsByCurrency } from './totals'

describe('totalsByCurrency', () => {
  it('adds up owed and owing within one currency', () => {
    const t = totalsByCurrency(
      [
        { currency: 'NGN', balances: { me: 6_666, a: -6_666 } },
        { currency: 'NGN', balances: { me: -2_000, b: 2_000 } },
        { currency: 'NGN', balances: { me: 0 } },
      ],
      'me',
      'NGN',
    )
    expect(t).toEqual([{ currency: 'NGN', owe: 2_000, owed: 6_666, net: 4_666, groups: 3 }])
  })

  it('keeps every currency on its own line, never adding or converting across them', () => {
    const t = totalsByCurrency(
      [
        { currency: 'GBP', balances: { me: -1_500 } },
        { currency: 'NGN', balances: { me: 3_565_000 } },
        { currency: 'JPY', balances: { me: 4_500 } },
        { currency: 'GBP', balances: { me: 500 } },
      ],
      'me',
      'NGN',
    )
    expect(t).toEqual([
      { currency: 'NGN', owe: 0, owed: 3_565_000, net: 3_565_000, groups: 1 },
      { currency: 'GBP', owe: 1_500, owed: 500, net: -1_000, groups: 2 },
      { currency: 'JPY', owe: 0, owed: 4_500, net: 4_500, groups: 1 },
    ])
  })

  it('puts my default currency first', () => {
    const t = totalsByCurrency(
      [
        { currency: 'NGN', balances: { me: 1 } },
        { currency: 'USD', balances: { me: 1 } },
      ],
      'me',
      'USD',
    )
    expect(t.map((x) => x.currency)).toEqual(['USD', 'NGN'])
  })

  it('treats a group without my balance as zero', () => {
    expect(totalsByCurrency([{ currency: 'EUR', balances: {} }], 'me', 'EUR')).toEqual([
      { currency: 'EUR', owe: 0, owed: 0, net: 0, groups: 1 },
    ])
  })
})
