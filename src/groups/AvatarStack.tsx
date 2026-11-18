import { Avatar } from '../ui/Avatar'
import type { Member } from './types'

const SHOWN = 5

/** Overlapping avatars of the first few members, with "+N" for the rest. */
export function AvatarStack({
  members,
  size = 'sm',
}: {
  members: readonly Member[]
  size?: 'sm' | 'md'
}) {
  const extra = members.length - SHOWN
  return (
    <span className="inline-flex items-center [&>*+*]:-ml-2">
      {members.slice(0, SHOWN).map((m) => (
        <Avatar key={m.uid} seed={m.uid} name={m.displayName} photoUrl={m.photoURL} size={size} />
      ))}
      {extra > 0 ? (
        <span
          className="ml-1.5! font-mono text-[.75rem] text-muted"
          aria-label={`and ${extra} more`}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  )
}
