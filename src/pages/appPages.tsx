import { useParams } from 'react-router'
import { GroupGate } from '../groups/GroupGate'
import { GroupView } from '../groups/GroupView'
import { SettleView } from '../payments/SettleView'

// The group routes.

function useGroupId(): string {
  const { id } = useParams()
  if (!id) throw new Error('Route is missing :id')
  return id
}

export function GroupPage() {
  const groupId = useGroupId()
  return <GroupGate groupId={groupId}>{(group) => <GroupView group={group} />}</GroupGate>
}

export function SettlePage() {
  const groupId = useGroupId()
  return <GroupGate groupId={groupId}>{(group) => <SettleView group={group} />}</GroupGate>
}
