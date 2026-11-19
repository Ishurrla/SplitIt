import { Link, useParams } from 'react-router'
import { GroupGate } from '../groups/GroupGate'
import { GroupView } from '../groups/GroupView'
import { SettleView } from '../payments/SettleView'
import { buttonClass } from '../ui/buttonStyles'

// The group routes and the not-found page.

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

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-[1040px] px-[22px] py-14">
      <h1 className="text-[clamp(2rem,5vw,3rem)] font-normal">There&apos;s no page here.</h1>
      <p className="mt-2 text-muted">Check the address, or go back to the start.</p>
      <Link to="/" className={`${buttonClass('primary')} mt-5`}>
        Go to SplitIt
      </Link>
    </main>
  )
}
