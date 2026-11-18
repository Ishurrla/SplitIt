import { Link } from 'react-router'
import { formatMinor } from '../lib/money'
import { Icon } from '../ui/Icon'
import { AvatarStack } from './AvatarStack'
import { GroupCover } from './Cover'
import { countLabel } from './names'
import { useMembers } from './queries'
import type { Group } from './types'

export const cardsGridClass =
  'mt-[18px] grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[22px]'
const cardClass =
  'flex flex-col overflow-hidden rounded-pen border-[1.5px] border-solid border-ink bg-sheet text-left transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-offset-md motion-reduce:transition-none'

/** The prototype's group card: cover, name, members and currency, avatars, and where you stand. */
export function GroupCard({ group, me }: { group: Group; me: string }) {
  const members = useMembers(group.id)
  const mine = group.balances[me] ?? 0
  return (
    <Link to={`/app/groups/${group.id}`} className={cardClass}>
      <span className="block aspect-[2/1] overflow-hidden border-b-[1.5px] border-solid border-ink bg-wash">
        <GroupCover cover={group.cover} coverPath={group.coverPath} />
      </span>
      <span className="flex flex-col gap-1 px-4 pt-3.5 pb-4">
        <span className="font-display text-[1.45rem] leading-[1.2]">{group.name}</span>
        <span className="text-[.88rem] text-muted">
          {countLabel(group.memberIds.length, 'member')} ·{' '}
          {countLabel(group.expenseCount ?? 0, 'expense')} · {group.currency}
        </span>
        <span className="mt-2.5 flex items-center justify-between gap-2">
          {members.data ? <AvatarStack members={members.data} /> : <span className="h-6" />}
          <span className="text-right text-[.85rem] text-muted">
            {mine > 0 ? (
              <>
                you&apos;re owed
                <span className="block font-mono text-base font-medium text-ink">
                  {formatMinor(mine, group.currency)}
                </span>
              </>
            ) : mine < 0 ? (
              <>
                you owe
                <span className="block font-mono text-base text-red">
                  {formatMinor(-mine, group.currency)}
                </span>
              </>
            ) : (
              'settled'
            )}
          </span>
        </span>
      </span>
    </Link>
  )
}

/** The dashed "Start a new group" card. */
export function NewGroupCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[250px] flex-col items-center justify-center gap-2 rounded-pen border-[1.5px] border-dashed border-ink bg-transparent font-semibold text-biro hover:bg-sheet"
    >
      <Icon name="plus" className="size-[30px]" />
      Start a new group
    </button>
  )
}

/** Placeholder cards while groups load. */
export function GroupCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-[250px] animate-pulse rounded-pen border-[1.5px] border-solid border-rule bg-wash"
        />
      ))}
    </>
  )
}
