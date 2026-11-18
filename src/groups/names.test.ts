import { describe, expect, it } from 'vitest'
import { countLabel, membersSentence } from './names'

describe('membersSentence', () => {
  const me = { uid: 'me', displayName: 'Dami' }
  it('names everyone else, then you', () => {
    expect(
      membersSentence(
        [me, { uid: 'a', displayName: 'Ada' }, { uid: 'f', displayName: 'Femi' }],
        'me',
      ),
    ).toBe('Ada, Femi and you')
    expect(membersSentence([{ uid: 'a', displayName: 'Ada' }, me], 'me')).toBe('Ada and you')
  })
  it('says when you are alone', () => {
    expect(membersSentence([me], 'me')).toBe('Just you so far')
  })
})

describe('countLabel', () => {
  it('uses the singular for one', () => {
    expect(countLabel(1, 'member')).toBe('1 member')
    expect(countLabel(0, 'member')).toBe('0 members')
    expect(countLabel(4, 'member')).toBe('4 members')
  })
})
