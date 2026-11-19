/**
 * The images to try for someone's avatar, best first: their uploaded photo, then their Google
 * photo. If both are missing or fail to load, the avatar falls back to the illustration chosen by
 * a stable hash of their uid (see avatarArt.ts).
 */
export function avatarSources(
  photo: { photoPath?: string | null | undefined; photoURL?: string | null | undefined },
  toUrl: (path: string) => string,
): string[] {
  const sources = [photo.photoPath ? toUrl(photo.photoPath) : null, photo.photoURL ?? null]
  return [...new Set(sources.filter((s): s is string => Boolean(s)))]
}
