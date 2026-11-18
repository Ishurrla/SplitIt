import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { NoAccessError } from './noAccess'
import { NotInGroup } from './NotInGroup'
import type { Group } from './types'
import { useGroup } from './useGroup'

/**
 * Loads a group and renders `children(group)` only for members. Anyone else sees the
 * "You're not in this group" screen; a network problem gets a retry button instead.
 */
export function GroupGate({
  groupId,
  children,
}: {
  groupId: string
  children: (group: Group) => ReactNode
}) {
  const query = useGroup(groupId)

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading group">
        <div className="h-[150px] animate-pulse border-[1.5px] border-solid border-rule bg-wash" />
        <div className="mt-5 h-12 w-2/3 animate-pulse bg-wash" />
      </div>
    )
  }
  if (query.error instanceof NoAccessError) {
    return <NotInGroup groupId={groupId} serverCode={query.error.serverCode} />
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
  return children(query.data)
}
