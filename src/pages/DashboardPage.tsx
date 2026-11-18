import { useState } from 'react'
import { Link } from 'react-router'
import { useSignedIn } from '../auth/context'
import { GroupCard, GroupCardSkeletons, cardsGridClass } from '../groups/GroupCard'
import { NewGroupModal } from '../groups/NewGroupModal'
import { useMyGroups } from '../groups/queries'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Phase 3: greeting and your groups. Balance tiles, chart and quick actions arrive in Phase 7. */
export function DashboardPage() {
  const { user, profile } = useSignedIn()
  const groups = useMyGroups(user.uid)
  const [creating, setCreating] = useState(false)
  const firstName = profile?.displayName.split(' ')[0] ?? ''

  return (
    <div>
      <p className="text-[.9rem] text-muted">{greeting(new Date().getHours())}</p>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">
        {firstName}, here is where you stand.
      </h1>
      <div className="mt-6 rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-5 text-center text-muted">
        Your totals and spending chart are built in Phase 7.
      </div>

      <div className="mt-[38px] flex items-baseline justify-between gap-3 border-b-[1.5px] border-solid border-ink pb-2">
        <h2 className="text-2xl">Your groups</h2>
        <Link to="/app/groups" className={buttonClass('link')}>
          View all
        </Link>
      </div>

      {groups.isError ? (
        <p className="mt-4 text-red">
          Couldn&apos;t load your groups.{' '}
          <Button variant="link" onClick={() => void groups.refetch()}>
            Try again
          </Button>
        </p>
      ) : groups.data?.length === 0 ? (
        <div className="mt-[18px] rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
          <h3 className="mb-1.5 text-2xl">No groups yet</h3>
          <p className="mb-4 text-muted">Start one, then invite the people you share costs with.</p>
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true)
            }}
          >
            Create group
          </Button>
        </div>
      ) : (
        <div className={cardsGridClass}>
          {groups.isPending ? (
            <GroupCardSkeletons />
          ) : (
            groups.data.slice(0, 3).map((g) => <GroupCard key={g.id} group={g} me={user.uid} />)
          )}
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
