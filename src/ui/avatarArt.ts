// The prototype's illustrated people, used when someone has no photo.
// Which one you get is decided by a hash of your uid, so it never changes between visits or devices.

export interface AvatarArt {
  bg: string
  skin: string
  hair: 'short' | 'afro' | 'scarf'
  hairColour: string
  top: string
}

export const AVATAR_ART: readonly AvatarArt[] = [
  { bg: '#FFEE9A', skin: '#7A4B32', hair: 'short', hairColour: '#1B1B1A', top: '#1E3FB8' },
  { bg: '#B9C6FF', skin: '#9A6340', hair: 'afro', hairColour: '#1B1B1A', top: '#B8231D' },
  { bg: '#F4B6A8', skin: '#6B4430', hair: 'short', hairColour: '#1B1B1A', top: '#1B1B1A' },
  { bg: '#FFEE9A', skin: '#A8734D', hair: 'scarf', hairColour: '#1E3FB8', top: '#EFE3B5' },
  { bg: '#CFE3D0', skin: '#8A5A3C', hair: 'short', hairColour: '#1B1B1A', top: '#1E3FB8' },
  { bg: '#B9C6FF', skin: '#B07A52', hair: 'afro', hairColour: '#1B1B1A', top: '#1B1B1A' },
]

/** FNV-1a: a small, fast string hash. Not for security, only to spread uids evenly. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function avatarArtFor(seed: string): AvatarArt {
  const art = AVATAR_ART[hashString(seed) % AVATAR_ART.length]
  if (!art) throw new Error('AVATAR_ART is empty')
  return art
}
