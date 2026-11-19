import { describe, expect, it } from 'vitest'
import { avatarArtFor } from './avatarArt'
import { avatarSources } from './avatarSources'

const toUrl = (path: string) => `https://files.example/${path}`

describe('avatarSources', () => {
  it('tries the uploaded photo first, then the Google photo', () => {
    expect(
      avatarSources(
        { photoPath: 'avatars/u1/me.jpg', photoURL: 'https://google.example/p.png' },
        toUrl,
      ),
    ).toEqual(['https://files.example/avatars/u1/me.jpg', 'https://google.example/p.png'])
  })

  it('uses the Google photo when nothing was uploaded', () => {
    expect(
      avatarSources({ photoPath: null, photoURL: 'https://google.example/p.png' }, toUrl),
    ).toEqual(['https://google.example/p.png'])
  })

  it('has nothing to try without either, so the illustration shows', () => {
    expect(avatarSources({ photoPath: null, photoURL: null }, toUrl)).toEqual([])
    expect(avatarSources({}, toUrl)).toEqual([])
  })

  it('and that illustration is the same for the same uid every time', () => {
    expect(avatarArtFor('u1')).toBe(avatarArtFor('u1'))
  })
})
