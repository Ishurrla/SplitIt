import { formatMinor, type CurrencyCode } from '../lib/money'
import type { ActivityEntry } from './types'

/**
 * One activity entry as a sentence, in the prototype's wording: "Ada added Suya ₦18,600",
 * "Bayo paid Ada ₦10", "Chi joined the group". `nameOf` gives "You" for the viewer.
 */
export function describeActivity(
  entry: Pick<ActivityEntry, 'actorId' | 'kind' | 'payload'>,
  nameOf: (uid: string) => string,
  currency: CurrencyCode,
): string {
  const actor = nameOf(entry.actorId)
  const p = entry.payload
  const text = (key: string) => (typeof p[key] === 'string' ? p[key] : '')
  const amount = () =>
    typeof p.amountMinor === 'number' ? ` ${formatMinor(p.amountMinor, currency)}` : ''
  const object = (uid: string) => {
    const n = nameOf(uid)
    return n === 'You' ? 'you' : n
  }

  switch (entry.kind) {
    case 'expense.added':
      return `${actor} added ${text('title')}${amount()}`
    case 'expense.edited':
      return `${actor} edited ${text('title')}`
    case 'expense.deleted':
      return `${actor} deleted ${text('title')}${amount()}`
    case 'payment.recorded':
      return `${nameOf(text('from'))} paid ${object(text('to'))}${amount()}`
    case 'member.joined':
      return `${actor} joined the group`
    case 'member.left':
      return `${actor} left the group`
    case 'member.removed':
      return `${actor} removed ${text('name') || 'someone'}`
    case 'invite.created':
      return `${actor} invited ${text('email')}`
    case 'group.created':
      return `${actor} started the group`
    case 'group.updated':
      return text('name')
        ? `${actor} renamed the group to ${text('name')}`
        : `${actor} changed the cover`
    case 'balances.recomputed':
      return `${actor} rebuilt the balances from every expense`
    default:
      return `${actor} made a change`
  }
}
