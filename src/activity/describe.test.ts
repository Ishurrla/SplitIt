import { describe, expect, it } from 'vitest'
import { describeActivity } from './describe'
import { activityCategory } from './types'

const names: Record<string, string> = { me: 'You', ada: 'Ada', bayo: 'Bayo' }
const nameOf = (uid: string) => names[uid] ?? 'Someone'
const say = (kind: string, actorId: string, payload: Record<string, string | number | null> = {}) =>
  describeActivity({ kind, actorId, payload }, nameOf, 'NGN')

describe('describeActivity', () => {
  it('describes expenses with their title and amount', () => {
    expect(say('expense.added', 'ada', { title: 'Suya', amountMinor: 1_860_000 })).toBe(
      'Ada added Suya ₦18,600',
    )
    expect(say('expense.edited', 'me', { title: 'Suya' })).toBe('You edited Suya')
    expect(say('expense.deleted', 'ada', { title: 'Taxi', amountMinor: 650_000 })).toBe(
      'Ada deleted Taxi ₦6,500',
    )
  })

  it('describes payments by who paid whom, whoever recorded them', () => {
    expect(say('payment.recorded', 'ada', { from: 'bayo', to: 'ada', amountMinor: 1_000 })).toBe(
      'Bayo paid Ada ₦10',
    )
    expect(say('payment.recorded', 'ada', { from: 'bayo', to: 'me', amountMinor: 1_000 })).toBe(
      'Bayo paid you ₦10',
    )
  })

  it('describes membership and group changes', () => {
    expect(say('member.joined', 'bayo')).toBe('Bayo joined the group')
    expect(say('member.left', 'bayo')).toBe('Bayo left the group')
    expect(say('member.removed', 'ada', { name: 'Bayo' })).toBe('Ada removed Bayo')
    expect(say('group.created', 'me')).toBe('You started the group')
    expect(say('group.updated', 'ada', { name: 'Flat 4B' })).toBe(
      'Ada renamed the group to Flat 4B',
    )
    expect(say('group.updated', 'ada', { name: null })).toBe('Ada changed the cover')
    expect(say('invite.created', 'ada', { email: 'chi@example.com' })).toBe(
      'Ada invited chi@example.com',
    )
  })

  it('still says something for a kind it does not know', () => {
    expect(say('something.new', 'ada')).toBe('Ada made a change')
  })
})

describe('activityCategory', () => {
  it('sorts kinds into the filter tabs', () => {
    expect(activityCategory('expense.deleted')).toBe('expenses')
    expect(activityCategory('payment.recorded')).toBe('payments')
    expect(activityCategory('member.joined')).toBe('groups')
    expect(activityCategory('balances.recomputed')).toBe('groups')
  })
})
