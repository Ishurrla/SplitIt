import { useState } from 'react'
import { useSignedIn } from '../auth/context'
import { GroupCard, GroupCardSkeletons, NewGroupCard, cardsGridClass } from '../groups/GroupCard'
import { NewGroupModal } from '../groups/NewGroupModal'
import { useMyGroups } from '../groups/queries'
import { Button } from '../ui/Button'

export function GroupsPage() {
  const { user } = useSignedIn()
  const groups = useMyGroups(user.uid)
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">Groups</h1>
      {groups.data ? (
        <p className="mt-2.5 font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
          {groups.data.length === 0
            ? 'No groups yet. Start one for a trip, a flat or a regular dinner.'
            : `${groups.data.length} group${groups.data.length === 1 ? '' : 's'}, each with its own tab.`}
        </p>
      ) : null}

      {groups.isError ? (
        <div className="mt-6 rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
          <h3 className="mb-1.5 text-2xl">Couldn&apos;t load your groups</h3>
          <p className="mb-4 text-muted">Check your connection, then try again.</p>
          <Button variant="primary" onClick={() => void groups.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className={cardsGridClass}>
          {groups.isPending ? (
            <GroupCardSkeletons />
          ) : (
            groups.data.map((g) => <GroupCard key={g.id} group={g} me={user.uid} />)
          )}
          <NewGroupCard
            onClick={() => {
              setCreating(true)
            }}
          />
        </div>
      )}

      {creating ? (
        <NewGroupModal
          onClose={() => {
            setCreating(false)
          }}
        />
      ) : null}
    </div>
  )
}
