import { useState } from 'react'
import { publicStorageUrl } from '../lib/storageUrl'
import { avatarArtFor } from './avatarArt'
import { avatarSources } from './avatarSources'

const SIZES = { sm: 'size-6', md: 'size-8', lg: 'size-11', xl: 'size-[84px] border-2' } as const

interface AvatarProps {
  /** Used for the illustration choice. Pass the uid so it is stable. */
  seed: string
  name: string
  /** An uploaded photo in avatars/{uid}/ (tried first). */
  photoPath?: string | null | undefined
  /** The Google account photo (tried second). */
  photoURL?: string | null | undefined
  size?: keyof typeof SIZES
  /** Hide from screen readers when the name is already written right next to it. */
  decorative?: boolean
}

/**
 * Round avatar with a pen border. Shows the uploaded photo, else the Google photo, else (or if
 * both fail to load) an illustration picked by a stable hash of the uid.
 */
export function Avatar({
  seed,
  name,
  photoPath,
  photoURL,
  size = 'md',
  decorative = false,
}: AvatarProps) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const src = avatarSources({ photoPath, photoURL }, publicStorageUrl).find((s) => !failed.has(s))
  return (
    <span
      title={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
      className={`inline-block shrink-0 overflow-hidden rounded-full border-[1.5px] border-solid border-ink bg-wash align-middle ${SIZES[size]}`}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={decorative ? '' : name}
          referrerPolicy="no-referrer"
          className="block size-full object-cover"
          onError={() => {
            setFailed((f) => new Set(f).add(src))
          }}
        />
      ) : (
        <Illustration seed={seed} name={decorative ? null : name} />
      )}
    </span>
  )
}
function Illustration({ seed, name }: { seed: string; name: string | null }) {
  const a = avatarArtFor(seed)
  return (
    <svg
      viewBox="0 0 40 40"
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      className="block size-full"
    >
      <rect width="40" height="40" fill={a.bg} />
      {a.hair === 'afro' ? <circle cx="20" cy="15" r="11.5" fill={a.hairColour} /> : null}
      <path d="M4 41c1-9.5 7-13.5 16-13.5S35 31.5 36 41z" fill={a.top} />
      <rect x="17" y="21" width="6" height="8" fill={a.skin} />
      <ellipse cx="20" cy="16.5" rx="7" ry="8" fill={a.skin} />
      {a.hair === 'short' ? (
        <path
          d="M12.6 15c0-6 3.2-9 7.4-9s7.4 3 7.4 9c-2-3-4.7-4-7.4-4s-5.4 1-7.4 4z"
          fill={a.hairColour}
        />
      ) : null}
      {a.hair === 'scarf' ? (
        <>
          <path
            d="M11.5 15c0-7 3.8-10.5 8.5-10.5S28.5 8 28.5 15c-3-3.2-5.5-4.2-8.5-4.2S14.5 11.8 11.5 15z"
            fill={a.hairColour}
          />
          <circle cx="27" cy="13" r="3" fill={a.hairColour} />
        </>
      ) : null}
    </svg>
  )
}
