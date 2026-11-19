import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useSignedIn } from '../auth/context'
import { personName, type People } from '../groups/people'
import { refreshGroup, useMembers, useSettlePlan } from '../groups/queries'
import type { Group } from '../groups/types'
import { callableErrorMessage } from '../lib/callables'
import { formatMinor } from '../lib/money'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/toastContext'
import { PaymentDialog } from './PaymentDialog'
import { transferKey, type Transfer } from './types'

const STRIKE_MS = 750
const card =
  'mt-[18px] grid justify-items-center gap-[22px] rounded-pen border-pen bg-sheet px-[22px] py-[30px] text-center @max-[860px]/shell:px-3.5 @max-[860px]/shell:py-6'

/**
 * The big settle-up screen: the payments you are part of, each as a card with the amount large,
 * then the whole plan on request. The plan comes from the settleUp function; nothing is worked out here.
 */
export function SettleView({ group }: { group: Group }) {
  const { user } = useSignedIn()
  const me = user.uid
  const members = useMembers(group.id)
  const plan = useSettlePlan(group.id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [paying, setPaying] = useState<Transfer | null>(null)
  const [struck, setStruck] = useState<ReadonlySet<string>>(new Set())
  const [breakdown, setBreakdown] = useState(false)

  const people: People = { me, members: members.data ?? [], pastMembers: group.pastMembers }
  const name = (uid: string) => personName(uid, people)

  function onRecorded(t: Transfer, amountMinor: number) {
    setPaying(null)
    const key = transferKey(t)
    setStruck((s) => new Set(s).add(key))
    const to = name(t.to)
    toast(
      `${name(t.from)} paid ${to === 'You' ? 'you' : to} ${formatMinor(amountMinor, group.currency)}.`,
    )
    window.setTimeout(() => {
      void refreshGroup(queryClient, group.id).then(() => {
        setStruck((s) => {
          const next = new Set(s)
          next.delete(key)
          return next
        })
      })
    }, STRIKE_MS)
  }

  let body
  if (plan.isPending || members.isPending) {
    body = (
      <div
        aria-busy="true"
        aria-label="Working out the payments"
        className={`${card} h-72 animate-pulse`}
      />
    )
  } else if (plan.isError || members.isError) {
    body = (
      <div className={card}>
        <p className="text-red">
          {plan.isError ? callableErrorMessage(plan.error) : "Couldn't load the members."}
        </p>
        <Button
          onClick={() => {
            void plan.refetch()
            void members.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  } else if (plan.data.transfers.length === 0) {
    body = (
      <div className={card}>
        <span className="inline-grid size-14 place-items-center text-biro [&_path]:animate-draw [&_path]:[stroke-dasharray:40] [&_path]:[stroke-dashoffset:40]">
          <Icon name="tick" className="size-full" />
        </span>
        <h2 className="text-[2rem]">All square.</h2>
        <p className="text-muted">Nobody owes anybody in {group.name}.</p>
      </div>
    )
  } else {
    const mine = plan.data.transfers.filter((t) => t.from === me || t.to === me)
    body =
      mine.length === 0 ? (
        <div className={card}>
          <h2 className="text-[1.8rem]">You are not part of any payment.</h2>
          <p className="text-muted">Other people in {group.name} still need to pay each other.</p>
        </div>
      ) : (
        mine.map((t) => {
          const out = t.from === me
          const isStruck = struck.has(transferKey(t))
          const memberOf = (uid: string) => members.data.find((m) => m.uid === uid)
          return (
            <div key={transferKey(t)} className={card}>
              <div className="flex w-full items-center justify-center gap-[22px] @max-[860px]/shell:gap-2.5">
                <span className="flex flex-col items-center gap-2 font-semibold">
                  <Avatar
                    seed={t.from}
                    name={name(t.from)}
                    photoPath={memberOf(t.from)?.photoPath}
                    photoURL={memberOf(t.from)?.photoURL}
                    size="xl"
                    decorative
                  />
                  {name(t.from)}
                </span>
                <span
                  aria-hidden="true"
                  className="relative h-0.5 min-w-10 flex-[0_1_120px] bg-[repeating-linear-gradient(90deg,var(--color-ink)_0_8px,transparent_8px_14px)] after:absolute after:top-[-5px] after:right-[-2px] after:border-[6px] after:border-r-0 after:border-l-[10px] after:border-transparent after:border-l-ink"
                />
                <span className="flex flex-col items-center gap-2 font-semibold">
                  <Avatar
                    seed={t.to}
                    name={name(t.to)}
                    photoPath={memberOf(t.to)?.photoPath}
                    photoURL={memberOf(t.to)?.photoURL}
                    size="xl"
                    decorative
                  />
                  {name(t.to)}
                </span>
              </div>
              <div>
                <small className="block text-muted">
                  {out ? `You pay ${name(t.to)}` : `${name(t.from)} pays you`}
                </small>
                <span className={`fig-big ${out ? 'text-red' : ''} ${isStruck ? 'struck' : ''}`}>
                  {formatMinor(t.amountMinor, group.currency)}
                </span>
              </div>
              <Button
                variant="primary"
                big
                className="w-[min(420px,100%)] justify-center"
                disabled={isStruck}
                onClick={() => {
                  setPaying(t)
                }}
              >
                {out ? 'Record payment' : 'Mark as received'}
              </Button>
            </div>
          )
        })
      )
  }

  return (
    <div>
      <Link
        to={`/app/groups/${group.id}`}
        className="mb-4 inline-block font-semibold text-muted hover:text-ink"
      >
        ← {group.name}
      </Link>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">Settle up</h1>
      <p className="mt-2.5 font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
        The fewest payments that clear everyone&apos;s balance.
      </p>
      {body}

      {plan.data && plan.data.transfers.length > 0 ? (
        <>
          <p className="mt-5 text-center">
            <Button
              variant="link"
              aria-expanded={breakdown}
              onClick={() => {
                setBreakdown((b) => !b)
              }}
            >
              {breakdown ? 'Hide full breakdown ↑' : 'View full breakdown ↓'}
            </Button>
          </p>
          {breakdown ? (
            <ul className="mt-[26px]">
              {plan.data.transfers.map((t) => (
                <li
                  key={transferKey(t)}
                  className="flex items-center gap-2.5 border-b border-rule py-3"
                >
                  <Avatar seed={t.from} name={name(t.from)} size="sm" decorative />
                  <span className="flex-1">
                    <b>{name(t.from)}</b> {t.from === me ? 'pay' : 'pays'}{' '}
                    <b>{t.to === me ? 'you' : name(t.to)}</b>
                  </span>
                  <span className="font-mono text-[.92em]">
                    {formatMinor(t.amountMinor, group.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {paying ? (
        <PaymentDialog
          group={group}
          transfer={paying}
          people={people}
          onClose={() => {
            setPaying(null)
          }}
          onRecorded={(amount) => {
            onRecorded(paying, amount)
          }}
        />
      ) : null}
    </div>
  )
}
