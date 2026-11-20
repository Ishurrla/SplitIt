import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { SettleUpResult } from '../../server/shared/schemas'
import { personName, type People } from '../groups/people'
import { SignedAmount } from '../groups/SignedAmount'
import type { Group } from '../groups/types'
import { callableErrorMessage } from '../lib/callables'
import { formatMinor } from '../lib/money'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { canRecord, transferKey, type Transfer } from './types'

const sectionTitle =
  'flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1.5 text-[1.3rem]'

/** Every member's balance: + is owed by the group, brackets owe the group. */
export function WhereEveryoneStands({ group, people }: { group: Group; people: People }) {
  return (
    <section>
      <h3 className={sectionTitle}>Where everyone stands</h3>
      <ul>
        {people.members.map((m) => (
          <li key={m.uid} className="flex items-center gap-2 border-b border-rule py-[9px]">
            <Avatar
              seed={m.uid}
              name={m.displayName}
              photoPath={m.photoPath}
              photoURL={m.photoURL}
              size="sm"
              decorative
            />
            <span>{personName(m.uid, people)}</span>
            <span
              aria-hidden="true"
              className="flex-1 translate-y-0.5 border-b-2 border-dotted border-rule"
            />
            <SignedAmount amount={group.balances[m.uid] ?? 0} currency={group.currency} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[.88rem] text-muted">Brackets mean they owe the group.</p>
    </section>
  )
}

interface ClearEverythingProps {
  group: Group
  people: People
  plan: UseQueryResult<SettleUpResult>
  /** Lines being struck through right now, after a payment was recorded. */
  struck: ReadonlySet<string>
  onTick: (t: Transfer) => void
}

/**
 * The settle-up plan from the settleUp function, one line per payment, each with a tick box.
 * Only the payer or the receiver can tick a line (recordPayment allows only them).
 */
export function ClearEverything({ group, people, plan, struck, onTick }: ClearEverythingProps) {
  return (
    <section>
      <h3 className={sectionTitle}>
        To clear everything{' '}
        <small className="font-mono text-[.72rem] font-normal text-muted">settleUp()</small>
      </h3>
      {plan.isPending ? (
        <p className="py-3 text-muted">Working out the fewest payments…</p>
      ) : plan.isError ? (
        <p className="py-3 text-[.9rem] text-red">
          {callableErrorMessage(plan.error)}{' '}
          <Button variant="link" onClick={() => void plan.refetch()}>
            Try again
          </Button>
        </p>
      ) : plan.data.transfers.length === 0 ? (
        <p className="flex items-center gap-3 pt-5 pb-1.5 font-display text-[1.5rem]">
          <span className="inline-grid size-[34px] place-items-center text-biro [&_path]:animate-draw [&_path]:[stroke-dasharray:40] [&_path]:[stroke-dashoffset:40]">
            <Icon name="tick" className="size-full" />
          </span>
          All square.
        </p>
      ) : (
        <>
          <ul>
            {plan.data.transfers.map((t) => {
              const key = transferKey(t)
              const mine = t.from === people.me || t.to === people.me
              const allowed = canRecord(t, people.me)
              const from = personName(t.from, people)
              const to = personName(t.to, people)
              const isStruck = struck.has(key)
              return (
                <li
                  key={key}
                  className={`relative flex items-center gap-3 border-b border-rule py-3 ${
                    mine
                      ? 'before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:bg-biro'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={!allowed || isStruck}
                    onClick={() => {
                      onTick(t)
                    }}
                    aria-label={`Mark ${from} paying ${to} as paid`}
                    title={allowed ? undefined : `Only ${from} or ${to} can record this payment.`}
                    className={`grid size-6 shrink-0 place-items-center rounded-tick border-[1.5px] border-solid p-0 ${
                      isStruck
                        ? 'border-biro bg-sheet text-biro'
                        : allowed
                          ? 'border-ink bg-sheet text-transparent hover:border-biro hover:text-biro'
                          : 'cursor-not-allowed border-rule bg-wash text-transparent'
                    }`}
                  >
                    <Icon name="tick" className="size-4" />
                  </button>
                  <span className={`flex-1 leading-[1.3] ${isStruck ? 'struck' : ''}`}>
                    <b>{from}</b> {t.from === people.me ? 'pay' : 'pays'}{' '}
                    <b>{to === 'You' ? 'you' : to}</b>
                  </span>
                  <span className={`font-mono text-[.92em] ${isStruck ? 'struck' : ''}`}>
                    {formatMinor(t.amountMinor, group.currency)}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[.88rem] text-muted">
            {plan.data.transfers.length} payment{plan.data.transfers.length === 1 ? '' : 's'} for{' '}
            {people.members.length} people, worked out by the server. Tick a line once the money has
            moved.{' '}
            <Link
              to={`/app/groups/${group.id}/settle`}
              className="font-semibold text-biro underline underline-offset-3"
            >
              Open settle-up screen
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
