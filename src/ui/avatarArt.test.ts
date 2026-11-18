import { describe, expect, it } from 'vitest'
import { AVATAR_ART, avatarArtFor, hashString } from './avatarArt'

describe('avatarArtFor', () => {
  it('gives the same uid the same illustration every time', () => {
    const uid = 'kX92mPq7RtV0aLz3'
    expect(avatarArtFor(uid)).toBe(avatarArtFor(uid))
    expect(hashString(uid)).toBe(hashString(uid))
  })

  it('matches the known FNV-1a value, so the choice cannot drift between releases', () => {
    expect(hashString('')).toBe(0x811c9dc5)
    expect(hashString('a')).toBe(0xe40c292c)
  })

  it('uses every illustration across many uids', () => {
    const used = new Set(Array.from({ length: 300 }, (_, i) => avatarArtFor(`user-${i}`)))
    expect(used.size).toBe(AVATAR_ART.length)
  })
})
