import type { ReactNode } from 'react'
import { useGroupLive } from '../live/groupLive'
import { Button } from '../ui/Button'
import { NoAccessError } from './noAccess'
import { NotInGroup } from './NotInGroup'
import type { Group } from './types'
import { useGroup } from './useGroup'

/**
 * Opens a group: starts its live listeners, then renders `children(group)` for members only.
 * Anyone else (or someone removed while looking) sees "You're not in this group"; any other
 * failure gets a retry button.
 */
export function GroupGate({
  groupId,
  children,
}: {
  groupId: string
  children: (group: Group) => ReactNode
}) {
  useGroupLive(groupId)
  const query = useGroup(groupId)

  if (query.error instanceof NoAccessError) {
    return (
      <NotInGroup
        groupId={groupId}
        serverCode={query.error.serverCode}
        whileViewing={query.error.whileViewing}
      />
    )
  }
  if (query.isError) {
    return (
      <div className="rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
        <h3 className="mb-1.5 text-2xl">Couldn&apos;t load this group</h3>
        <p className="mb-4 text-muted">Check your connection, then try again.</p>
        <Button variant="primary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!query.data) {
    return (
      <div aria-busy="true" aria-label="Loading group">
        <div className="h-[150px] animate-pulse border-[1.5px] border-solid border-rule bg-wash" />
        <div className="mt-5 h-12 w-2/3 animate-pulse bg-wash" />
      </div>
    )
  }
  return children(query.data)
}
