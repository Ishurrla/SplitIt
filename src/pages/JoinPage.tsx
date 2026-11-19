import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useSignedIn } from '../auth/context'
import {
  acceptInvite,
  callableErrorMessage,
  invitePreview,
  isConnectionError,
} from '../lib/callables'
import { LogOutButton } from '../shell/LogOutButton'
import { Brand } from '../ui/Brand'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { useToast } from '../ui/toastContext'

/**
 * /join/:token, behind sign-in (a signed-out visitor goes to /auth and comes back here).
 * invitePreview tells us only the group's name, who invited you, and whether the invite works for
 * you; the group itself stays unreadable until you have joined.
 */
export function JoinPage() {
  const { token = '' } = useParams()
  const { user } = useSignedIn()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['invitePreview', token, user.uid],
    queryFn: () => invitePreview({ token }),
    retry: false,
  })

  async function join() {
    setJoining(true)
    setJoinError(null)
    try {
      const { groupId } = await acceptInvite({ token })
      await queryClient.invalidateQueries({ queryKey: ['groups'] })
      await navigate(`/app/groups/${groupId}`, { replace: true })
      toast(`You joined ${preview.data?.groupName ?? 'the group'}.`)
    } catch (e) {
      setJoinError(callableErrorMessage(e))
      setJoining(false)
    }
  }

  let body: ReactNode
  if (preview.isPending) {
    body = <Panel title="Checking your invite…" />
  } else if (preview.isError) {
    body = (
      <Panel title="This invite doesn't work" text={callableErrorMessage(preview.error)}>
        <Link to="/app" className={buttonClass('primary')}>
          Go to SplitIt
        </Link>
        {isConnectionError(preview.error) ? (
          <Button className="ml-2.5" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        ) : null}
      </Panel>
    )
  } else {
    const { status, groupName, inviterName, groupId } = preview.data
    switch (status) {
      case 'valid':
        body = (
          <Panel
            eyebrow="You're invited"
            title={`Join ${groupName}`}
            text={`${inviterName} invited you. You'll see the group's expenses and balances once you join.`}
          >
            <Button variant="primary" big disabled={joining} onClick={() => void join()}>
              {joining ? 'Joining…' : `Join ${groupName}`}
            </Button>
            <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
              {joinError}
            </p>
          </Panel>
        )
        break
      case 'already-member':
        body = (
          <Panel title={`You're already in ${groupName}`} text="No need to join again.">
            <Link to={`/app/groups/${groupId ?? ''}`} className={buttonClass('primary')}>
              Open {groupName}
            </Link>
          </Panel>
        )
        break
      case 'expired':
        body = (
          <Panel
            title="This invite has expired"
            text={`Ask ${inviterName} for a new link to ${groupName}.`}
          >
            <Link to="/app" className={buttonClass()}>
              Go to SplitIt
            </Link>
          </Panel>
        )
        break
      case 'used':
        body = (
          <Panel
            title="This invite has been used"
            text={`Personal invites work once. Ask ${inviterName} for a new one.`}
          >
            <Link to="/app" className={buttonClass()}>
              Go to SplitIt
            </Link>
          </Panel>
        )
        break
      case 'wrong-email':
        body = (
          <Panel
            title="This invite is for someone else"
            text={`${inviterName} invited a different email address to ${groupName}. If that's you, log out and sign in with that address.`}
          >
            <LogOutButton />
          </Panel>
        )
        break
      case 'full':
        body = (
          <Panel
            title={`${groupName} is full`}
            text="A group can have up to 50 members. Ask the owner to make room."
          />
        )
        break
    }
  }

  return (
    <main className="mx-auto max-w-[640px] px-[22px] py-14 max-[860px]:px-[18px] max-[860px]:py-[26px]">
      <Brand to="/app" className="mb-[26px] block" />
      {body}
    </main>
  )
}

function Panel({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <section className="rounded-pen border-pen bg-sheet px-[30px] pt-[30px] pb-[34px] shadow-offset">
      {eyebrow ? <p className="text-[.9rem] text-muted">{eyebrow}</p> : null}
      <h1 className="text-[clamp(1.9rem,4.5vw,2.6rem)] leading-[1.1] font-normal">{title}</h1>
      {text ? <p className="mt-3 max-w-[48ch] text-muted">{text}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  )
}
