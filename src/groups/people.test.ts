import { describe, expect, it } from 'vitest'
import { personName, type People } from './people'

const people: People = {
  me: 'me',
  members: [
    { uid: 'me', displayName: 'Dami', photoURL: null },
    { uid: 'ada', displayName: 'Ada', photoURL: null },
  ],
  pastMembers: { bayo: { displayName: 'Bayo' } },
}

describe('personName', () => {
  it('calls you "You" and members by name', () => {
    expect(personName('me', people)).toBe('You')
    expect(personName('ada', people)).toBe('Ada')
  })

  it('still names someone who left, marked as left', () => {
    expect(personName('bayo', people)).toBe('Bayo (left)')
  })

  it('falls back to "Someone" with no record', () => {
    expect(personName('ghost', people)).toBe('Someone')
  })

  it('prefers the current membership if someone left and came back', () => {
    expect(
      personName('bayo', {
        ...people,
        members: [...people.members, { uid: 'bayo', displayName: 'Bayo L.', photoURL: null }],
      }),
    ).toBe('Bayo L.')
  })
})
