import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { RecentActivity } from '../activity/RecentActivity'
import { useSignedIn } from '../auth/context'
import { ExpenseModal } from '../expenses/ExpenseModal'
import { Ledger } from '../expenses/Ledger'
import type { Expense } from '../expenses/types'
import {
  callableErrorMessage,
  deleteExpense,
  leaveGroup,
  recomputeBalances,
  removeMember,
} from '../lib/callables'
import { ACCEPT_ATTR, imageProblem } from '../lib/images'
import { CURRENCIES, formatMinor } from '../lib/money'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/toastContext'
import { expectLeaving, useFreshIds } from '../live/groupLive'
import { PaymentDialog } from '../payments/PaymentDialog'
import { ClearEverything, WhereEveryoneStands } from '../payments/Standing'
import { transferKey, type Transfer } from '../payments/types'
import { AvatarStack } from './AvatarStack'
import { GroupCover } from './Cover'
import { InviteModal } from './InviteModal'
import { countLabel, membersSentence } from './names'
import { personName, type People } from './people'
import {
  refreshGroup,
  useActivity,
  useExpenses,
  useMembers,
  usePayments,
  useSettlePlan,
} from './queries'
import type { Group, Member } from './types'
import { uploadCover } from './uploadCover'

type Dialog =
  | { kind: 'invite' }
  | { kind: 'leave' }
  | { kind: 'remove'; member: Member }
  | { kind: 'expense'; expense?: Expense }
  | { kind: 'deleteExpense'; expense: Expense }
  | { kind: 'pay'; transfer: Transfer }
  | null

/** How long the strike-through plays before the payment's row is replaced by the new plan. */
const STRIKE_MS = 750

/** One group: cover, name, who is in it, its ledger, balances and settle-up plan. */
export function GroupView({ group }: { group: Group }) {
  const { user } = useSignedIn()
  const me = user.uid
  const members = useMembers(group.id)
  // Filled by the group's live listeners, started in <GroupGate>.
  const expenses = useExpenses(group.id, 'live')
  const payments = usePayments(group.id, 'live')
  const activity = useActivity(group.id, 'live')
  const fresh = useFreshIds(group.id)
  // ?expense=<id> (from search) opens and highlights that expense.
  const [params, setParams] = useSearchParams()
  const focusId = params.get('expense')
  const addParam = params.get('add')
  useEffect(() => {
    // Drop ?add= once used, so a refresh doesn't open the dialog again.
    if (addParam) {
      setParams(
        (p) => {
          p.delete('add')
          return p
        },
        { replace: true },
      )
    }
  }, [addParam, setParams])
  const plan = useSettlePlan(group.id)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const coverInput = useRef<HTMLInputElement>(null)
  // ?add=expense or ?add=invite (from the dashboard's quick actions) opens that dialog on arrival.
  const [dialog, setDialog] = useState<Dialog>(() => {
    const add = new URLSearchParams(window.location.search).get('add')
    return add === 'expense' ? { kind: 'expense' } : add === 'invite' ? { kind: 'invite' } : null
  })
  const [uploading, setUploading] = useState(false)
  const [struck, setStruck] = useState<ReadonlySet<string>>(new Set())
  const [checking, setChecking] = useState(false)

  const isOwner = members.data?.some((m) => m.uid === me && m.role === 'owner') ?? false
  const mine = group.balances[me] ?? 0
  const people: People = { me, members: members.data ?? [], pastMembers: group.pastMembers }
  const openAddExpense = () => {
    setDialog({ kind: 'expense' })
  }
  // "You owe Ada ₦35,650." when one payment clears you, as in the prototype.
  const myPayments = plan.data?.transfers.filter((t) => t.from === me) ?? []
  const myOnlyPayment = mine < 0 && myPayments.length === 1 ? myPayments[0] : undefined

  /** After a payment is saved: strike the line through, then fetch the new balances and plan. */
  function onPaymentRecorded(transfer: Transfer, amountMinor: number) {
    setDialog(null)
    const key = transferKey(transfer)
    setStruck((s) => new Set(s).add(key))
    const from = personName(transfer.from, people)
    const to = personName(transfer.to, people)
    toast(`${from} paid ${to === 'You' ? 'you' : to} ${formatMinor(amountMinor, group.currency)}.`)
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

  async function checkBalances() {
    setChecking(true)
    try {
      const result = await recomputeBalances({ groupId: group.id })
      await refreshGroup(queryClient, group.id)
      toast(
        result.changed
          ? `Balances were rebuilt from ${countLabel(result.expenses, 'expense')} and ${countLabel(result.payments, 'payment')}.`
          : `Balances are correct: they match ${countLabel(result.expenses, 'expense')} and ${countLabel(result.payments, 'payment')}.`,
      )
    } catch (e) {
      toast(callableErrorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  async function onCoverChosen(file: File | undefined) {
    if (!file) return
    const problem = imageProblem(file)
    if (problem) {
      toast(problem)
      return
    }
    setUploading(true)
    try {
      await uploadCover(group.id, file)
      await refreshGroup(queryClient, group.id)
      toast('Cover photo updated.')
    } catch (e) {
      toast(`The photo didn't upload. ${callableErrorMessage(e)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <Link to="/app/groups" className="mb-4 inline-block font-semibold text-muted hover:text-ink">
        ← All groups
      </Link>

      <div className="relative mb-5 h-[150px] overflow-hidden border-[1.5px] border-solid border-ink bg-wash @max-[860px]/shell:h-[110px]">
        <GroupCover cover={group.cover} coverPath={group.coverPath} />
        {isOwner ? (
          <>
            <Button
              className="absolute right-2.5 bottom-2.5 bg-sheet! px-[11px]! py-1.5! text-[.85rem]"
              disabled={uploading}
              onClick={() => {
                coverInput.current?.click()
              }}
            >
              {uploading ? 'Uploading…' : 'Change cover'}
            </Button>
            <input
              ref={coverInput}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(e) => {
                void onCoverChosen(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] leading-[1.1] font-normal">{group.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2.5 text-muted">
            {members.data ? (
              <>
                <AvatarStack members={members.data} size="md" />
                <span>{membersSentence(members.data, me)}</span>
              </>
            ) : null}
            <span
              title={CURRENCIES[group.currency].name}
              className="rounded-tick border border-solid border-muted px-1.5 font-mono text-[.75rem]"
            >
              {group.currency}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[.85rem] before:size-[7px] before:rounded-full before:bg-biro">
              Updates live
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={() => {
              setDialog({ kind: 'invite' })
            }}
          >
            Invite
          </Button>
          <Link to={`/app/groups/${group.id}/settle`} className={buttonClass()}>
            Settle up
          </Link>
          <Button variant="primary" disabled={!members.data} onClick={openAddExpense}>
            Add expense
          </Button>
        </div>
      </div>

      <p className="mt-2.5 font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
        {mine > 0 ? (
          <>
            You&apos;re owed{' '}
            <span className="fig-total text-[.8em]">{formatMinor(mine, group.currency)}</span>.
          </>
        ) : mine < 0 && myOnlyPayment ? (
          <>
            You owe {personName(myOnlyPayment.to, people)}{' '}
            <span className="fig-total text-[.8em] text-red">
              {formatMinor(myOnlyPayment.amountMinor, group.currency)}
            </span>
            .
          </>
        ) : mine < 0 ? (
          <>
            You owe{' '}
            <span className="fig-total text-[.8em] text-red">
              {formatMinor(-mine, group.currency)}
            </span>{' '}
            in total.
          </>
        ) : (
          <>You&apos;re all square here.</>
        )}
      </p>

      <div className="mt-[26px] grid grid-cols-[minmax(0,1fr)_330px] items-start gap-11 @max-[860px]/shell:grid-cols-1 @max-[860px]/shell:gap-[34px]">
        <div>
          {expenses.isPending || members.isPending || payments.isPending ? (
            <div
              aria-busy="true"
              aria-label="Loading expenses"
              className="h-40 animate-pulse bg-wash"
            />
          ) : expenses.isError || payments.isError ? (
            <div className="rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
              <h3 className="mb-1.5 text-2xl">Couldn&apos;t load the expenses</h3>
              <p className="mb-4 text-muted">Check your connection, then try again.</p>
              <Button
                variant="primary"
                onClick={() => {
                  void expenses.refetch()
                  void payments.refetch()
                }}
              >
                Try again
              </Button>
            </div>
          ) : expenses.data.length === 0 && payments.data.length === 0 ? (
            <div className="rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
              <h3 className="mb-1.5 text-2xl">Nothing written down yet</h3>
              <p className="mb-4 text-muted">
                Add the first expense. Everyone in the group sees it the moment you save.
              </p>
              <Button variant="primary" disabled={!members.data} onClick={openAddExpense}>
                Add expense
              </Button>
            </div>
          ) : (
            <Ledger
              group={group}
              expenses={expenses.data}
              payments={payments.data}
              people={people}
              freshIds={fresh}
              focusId={focusId}
              key={focusId ?? 'ledger'}
              onEdit={(expense) => {
                setDialog({ kind: 'expense', expense })
              }}
              onDelete={(expense) => {
                setDialog({ kind: 'deleteExpense', expense })
              }}
            />
          )}
        </div>

        <aside className="flex flex-col gap-[34px] @max-[860px]/shell:order-first">
          {members.data ? <WhereEveryoneStands group={group} people={people} /> : null}
          {members.data ? (
            <ClearEverything
              group={group}
              people={people}
              plan={plan}
              struck={struck}
              onTick={(transfer) => {
                setDialog({ kind: 'pay', transfer })
              }}
            />
          ) : null}
          {members.data && activity.data ? (
            <RecentActivity group={group} entries={activity.data} people={people} />
          ) : null}
          <section>
            <h3 className="flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1.5 text-[1.3rem]">
              Members
            </h3>
            {members.isPending ? (
              <p className="py-3 text-muted">Loading members…</p>
            ) : members.isError ? (
              <p className="py-3 text-[.9rem] text-red">
                Couldn&apos;t load the members.{' '}
                <Button variant="link" onClick={() => void members.refetch()}>
                  Try again
                </Button>
              </p>
            ) : (
              <ul>
                {members.data.map((m) => (
                  <li key={m.uid} className="flex items-center gap-2 border-b border-rule py-[9px]">
                    <Avatar
                      seed={m.uid}
                      name={m.displayName}
                      photoPath={m.photoPath}
                      photoURL={m.photoURL}
                      size="sm"
                      decorative
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {m.uid === me ? 'You' : m.displayName}
                      {m.role === 'owner' ? (
                        <span className="ml-2 text-[.8rem] text-muted">owner</span>
                      ) : null}
                    </span>
                    {isOwner && m.uid !== me ? (
                      <Button
                        variant="link"
                        className="text-[.85rem]"
                        aria-label={`Remove ${m.displayName} from the group`}
                        onClick={() => {
                          setDialog({ kind: 'remove', member: m })
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="link"
              className="mt-3 text-[.9rem] text-red!"
              onClick={() => {
                setDialog({ kind: 'leave' })
              }}
            >
              Leave group
            </Button>
            {isOwner ? (
              <p className="mt-3 text-[.88rem] text-muted">
                Balances are kept up to date as things change.{' '}
                <Button variant="link" disabled={checking} onClick={() => void checkBalances()}>
                  {checking ? 'Checking…' : 'Check them against every expense'}
                </Button>
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      {dialog?.kind === 'expense' && members.data ? (
        <ExpenseModal
          group={group}
          members={members.data}
          me={me}
          expense={dialog.expense}
          onClose={() => {
            setDialog(null)
          }}
        />
      ) : null}

      {dialog?.kind === 'pay' ? (
        <PaymentDialog
          group={group}
          transfer={dialog.transfer}
          people={people}
          onClose={() => {
            setDialog(null)
          }}
          onRecorded={(amount) => {
            onPaymentRecorded(dialog.transfer, amount)
          }}
        />
      ) : null}

      {dialog?.kind === 'deleteExpense' ? (
        <ConfirmDialog
          title="Delete this expense?"
          description={`${dialog.expense.title} · ${formatMinor(dialog.expense.amountMinor, group.currency)}. Everyone's balances change, and the activity log records that you deleted it.`}
          confirmLabel="Delete expense"
          cancelLabel="Keep it"
          danger
          onClose={() => {
            setDialog(null)
          }}
          onConfirm={async () => {
            try {
              await deleteExpense({ groupId: group.id, expenseId: dialog.expense.id })
            } catch (e) {
              return callableErrorMessage(e)
            }
            setDialog(null)
            await refreshGroup(queryClient, group.id)
            toast(`Deleted ${dialog.expense.title}.`)
            return null
          }}
        />
      ) : null}

      {dialog?.kind === 'invite' ? (
        <InviteModal
          group={group}
          isOwner={isOwner}
          onClose={() => {
            setDialog(null)
          }}
        />
      ) : null}

      {dialog?.kind === 'leave' ? (
        <ConfirmDialog
          title={`Leave ${group.name}?`}
          description={
            group.memberIds.length === 1
              ? "You're the only member, so the group and everything in it will be deleted."
              : isOwner
                ? 'You will lose access straight away. The longest-standing member becomes the owner.'
                : 'You will lose access straight away. Someone can invite you back later.'
          }
          confirmLabel="Leave group"
          danger
          onClose={() => {
            setDialog(null)
          }}
          onConfirm={async () => {
            // Our own listener will be refused the moment we leave; that is expected, not news.
            expectLeaving(group.id, true)
            try {
              await leaveGroup({ groupId: group.id })
            } catch (e) {
              expectLeaving(group.id, false)
              return callableErrorMessage(e)
            }
            setDialog(null)
            await navigate('/app/groups')
            expectLeaving(group.id, false)
            queryClient.removeQueries({ queryKey: ['group', group.id] })
            await queryClient.invalidateQueries({ queryKey: ['groups'] })
            toast(`You left ${group.name}.`)
            return null
          }}
        />
      ) : null}

      {dialog?.kind === 'remove' ? (
        <ConfirmDialog
          title={`Remove ${dialog.member.displayName}?`}
          description="They lose access straight away. Their name stays on expenses they were part of."
          confirmLabel="Remove"
          danger
          onClose={() => {
            setDialog(null)
          }}
          onConfirm={async () => {
            try {
              await removeMember({ groupId: group.id, uid: dialog.member.uid })
            } catch (e) {
              return callableErrorMessage(e)
            }
            setDialog(null)
            await refreshGroup(queryClient, group.id)
            toast(`${dialog.member.displayName} was removed.`)
            return null
          }}
        />
      ) : null}
    </div>
  )
}
