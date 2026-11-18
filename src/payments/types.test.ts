import { describe, expect, it } from 'vitest'
import { canRecord, paymentEffect, transferKey } from './types'

describe('paymentEffect', () => {
  const p = { from: 'bayo', to: 'ada', amountMinor: 3_333 }
  it('is + for the payer (their balance goes up) and − for the receiver', () => {
    expect(paymentEffect(p, 'bayo')).toBe(3_333)
    expect(paymentEffect(p, 'ada')).toBe(-3_333)
    expect(paymentEffect(p, 'chi')).toBe(0)
  })
})

describe('canRecord', () => {
  it('lets only the two people in the payment record it', () => {
    expect(canRecord({ from: 'bayo', to: 'ada' }, 'bayo')).toBe(true)
    expect(canRecord({ from: 'bayo', to: 'ada' }, 'ada')).toBe(true)
    expect(canRecord({ from: 'bayo', to: 'ada' }, 'chi')).toBe(false)
  })
})

describe('transferKey', () => {
  it('is different for each direction', () => {
    expect(transferKey({ from: 'a', to: 'b' })).not.toBe(transferKey({ from: 'b', to: 'a' }))
  })
})
