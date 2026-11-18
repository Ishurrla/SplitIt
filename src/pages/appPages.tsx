import { Link, useParams } from 'react-router'
import { useSignedIn } from '../auth/context'
import { GroupGate } from '../groups/GroupGate'
import { LogOutButton } from '../shell/LogOutButton'
import { buttonClass } from '../ui/buttonStyles'
import { PageStub } from './PageStub'

// Screens reachable in Phase 2. Most are stubs that name the phase that builds them; the group
// routes are real enough to prove the "not in this group" behaviour against the actual rules.

export function DashboardPage() {
  const { profile } = useSignedIn()
  const firstName = profile?.displayName.split(' ')[0] ?? ''
  return <PageStub eyebrow="Dashboard" title={`Hello, ${firstName}.`} phase={7} />
}

export function GroupsPage() {
  return <PageStub title="Groups" phase={3} />
}

export function ActivityPage() {
  return <PageStub title="Activity" phase={6} />
}

export function SettingsPage() {
  // Log out works now: on phones the sidebar (and its Log out link) is hidden.
  return (
    <PageStub title="Settings" phase={7}>
      <div className="mt-[18px] flex flex-wrap items-center justify-between gap-4 border-b border-rule py-[18px]">
        <div>
          <b className="block font-semibold">Log out</b>
          <span className="text-[.9rem] text-muted">Sign out of SplitIt on this device.</span>
        </div>
        <LogOutButton />
      </div>
    </PageStub>
  )
}

function useGroupId(): string {
  const { id } = useParams()
  if (!id) throw new Error('Route is missing :id')
  return id
}

export function GroupPage() {
  const groupId = useGroupId()
  return (
    <GroupGate groupId={groupId}>
      {(group) => <PageStub eyebrow={group.currency} title={group.name} phase={3} />}
    </GroupGate>
  )
}

export function SettlePage() {
  const groupId = useGroupId()
  return (
    <GroupGate groupId={groupId}>
      {(group) => <PageStub eyebrow={group.name} title="Settle up" phase={5} />}
    </GroupGate>
  )
}

export function JoinPage() {
  const { token } = useParams()
  return (
    <main className="mx-auto max-w-[1040px] px-[22px] py-14">
      <PageStub eyebrow="Invitation" title="Join a group" phase={3}>
        <p className="mt-2 font-mono text-[.85rem] text-muted">Invite token: {token}</p>
      </PageStub>
    </main>
  )
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
