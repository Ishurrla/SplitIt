import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { personName, type People } from '../groups/people'
import { SignedAmount } from '../groups/SignedAmount'
import { useStorageUrl } from '../groups/queries'
import type { Group } from '../groups/types'
import { formatMinor, type CurrencyCode } from '../lib/money'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { paymentEffect, type Payment } from '../payments/types'
import { myEffect, peopleInExpense, type Expense } from './types'

interface LedgerProps {
  group: Group
  expenses: readonly Expense[]
  payments: readonly Payment[]
  people: People
  onEdit: (e: Expense) => void
  onDelete: (e: Expense) => void
  /** Rows that arrived in the last few seconds: they get the highlighter sweep. */
  freshIds: ReadonlySet<string>
  /** An expense to open, scroll to and highlight (from search). */
  focusId: string | null
}

type Row =
  | { kind: 'expense'; at: number; expense: Expense }
  | { kind: 'payment'; at: number; payment: Payment }

const shortDate = (r: { createdAt: Expense['createdAt'] }) =>
  r.createdAt
    ? r.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—'

// Below 860px of app width the Paid by column folds under the title, as in the prototype.
const NARROW_HIDE = '@max-[860px]/shell:hidden'
const NARROW_SHOW = 'hidden @max-[860px]/shell:block'

/**
 * The group's ledger: expenses and payments together, newest first, with the total spent (expenses
 * only) underneath. A row that hasn't got its server time yet sorts first: it was just added.
 */
export function Ledger({
  group,
  expenses,
  payments,
  people,
  onEdit,
  onDelete,
  freshIds,
  focusId,
}: LedgerProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []))

  useEffect(() => {
    if (focusId) document.getElementById(`expense-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [focusId])
  const [viewing, setViewing] = useState<Expense | null>(null)
  const currency = group.currency
  const totalSpent = expenses.reduce((sum, e) => sum + e.amountMinor, 0)
  const rows: Row[] = [
    ...expenses.map((expense): Row => ({
      kind: 'expense',
      at: expense.createdAt?.toMillis() ?? Infinity,
      expense,
    })),
    ...payments.map((payment): Row => ({
      kind: 'payment',
      at: payment.createdAt?.toMillis() ?? Infinity,
      payment,
    })),
  ].sort((a, b) => b.at - a.at)

  function toggle(id: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[.95rem]">
        <thead>
          <tr className="border-b-[1.5px] border-solid border-ink text-left text-[.75rem] tracking-[.06em] text-muted uppercase">
            <th className="px-2 pb-2 font-semibold">Date</th>
            <th className="px-2 pb-2 font-semibold">What</th>
            <th className={`px-2 pb-2 font-semibold ${NARROW_HIDE}`}>Paid by</th>
            <th className="px-2 pb-2 text-right font-semibold">Amount</th>
            <th className="px-2 pb-2 text-right font-semibold">You</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'payment') {
              return (
                <PaymentRow
                  key={row.payment.id}
                  payment={row.payment}
                  fresh={freshIds.has(row.payment.id)}
                  people={people}
                  currency={currency}
                />
              )
            }
            const e = row.expense
            const isOpen = open.has(e.id)
            const payer = personName(e.paidBy, people)
            return (
              <Fragment key={e.id}>
                <tr
                  id={`expense-${e.id}`}
                  className={`border-b border-rule align-baseline ${freshIds.has(e.id) || e.id === focusId ? 'row-fresh' : ''}`}
                >
                  <td className="w-16 px-2 py-3 font-mono text-[.82rem] whitespace-nowrap text-muted">
                    {shortDate(e)}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => {
                        toggle(e.id)
                      }}
                      className="text-left font-semibold before:inline-block before:w-[1.1em] before:font-mono before:font-normal before:text-muted before:content-['+'] hover:underline hover:decoration-biro hover:underline-offset-4 aria-expanded:before:content-['–']"
                    >
                      {e.title}
                    </button>
                    {e.receiptPath ? (
                      <button
                        type="button"
                        aria-label={`View receipt for ${e.title}`}
                        onClick={() => {
                          setViewing(e)
                        }}
                        className="ml-2 inline-grid place-items-center rounded-tick border-[1.5px] border-solid border-muted px-1 py-px align-[-3px] text-muted hover:border-biro hover:text-biro"
                      >
                        <Icon name="photo" className="size-3.5" />
                      </button>
                    ) : null}
                    <span className={`text-[.85rem] font-normal text-muted ${NARROW_SHOW}`}>
                      Paid by {payer}
                    </span>
                  </td>
                  <td className={`px-2 py-3 ${NARROW_HIDE}`}>
                    <span className="inline-flex items-center gap-2">
                      <Avatar
                        seed={e.paidBy}
                        name={payer}
                        photoPath={people.members.find((m) => m.uid === e.paidBy)?.photoPath}
                        photoURL={people.members.find((m) => m.uid === e.paidBy)?.photoURL}
                        size="sm"
                        decorative
                      />
                      {payer}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-[.92em] whitespace-nowrap">
                    {formatMinor(e.amountMinor, currency)}
                  </td>
                  <td className="px-2 py-3 text-right whitespace-nowrap">
                    <SignedAmount amount={myEffect(e, people.me)} currency={currency} />
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-rule">
                    <td />
                    <td colSpan={4} className="bg-sheet px-2 pt-2.5 pb-3 text-[.9rem] text-muted">
                      <SplitLine expense={e} people={people} currency={currency} />
                      <Actions
                        expense={e}
                        group={group}
                        people={people}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-[1.5px] border-solid border-ink font-semibold">
            <td />
            <td colSpan={2} className="px-2 pt-3 @max-[860px]/shell:col-span-1">
              Total spent
            </td>
            <td className="px-2 pt-3 text-right">
              <span className="fig-total text-[.92em]">{formatMinor(totalSpent, currency)}</span>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      {viewing ? (
        <ReceiptViewer
          expense={viewing}
          currency={currency}
          onClose={() => {
            setViewing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** "Payment: Bayo → Ada", in italics like the prototype; payments can't be opened or changed. */
function PaymentRow({
  payment,
  people,
  currency,
  fresh,
}: {
  payment: Payment
  people: People
  currency: CurrencyCode
  fresh: boolean
}) {
  const from = personName(payment.from, people)
  const to = personName(payment.to, people)
  return (
    <tr
      className={`border-b border-rule align-baseline text-muted italic ${fresh ? 'row-fresh' : ''}`}
    >
      <td className="w-16 px-2 py-3 font-mono text-[.82rem] whitespace-nowrap not-italic">
        {shortDate(payment)}
      </td>
      <td className="px-2 py-3">
        Payment: {from} → {to}
      </td>
      <td className={`px-2 py-3 ${NARROW_HIDE}`}>{from}</td>
      <td className="px-2 py-3 text-right font-mono text-[.92em] whitespace-nowrap not-italic">
        {formatMinor(payment.amountMinor, currency)}
      </td>
      <td className="px-2 py-3 text-right whitespace-nowrap not-italic">
        <SignedAmount amount={paymentEffect(payment, people.me)} currency={currency} />
      </td>
    </tr>
  )
}

function SplitLine({
  expense,
  people,
  currency,
}: {
  expense: Expense
  people: People
  currency: CurrencyCode
}) {
  const entries = Object.entries(expense.splits)
  return (
    <p>
      Split {entries.length} way{entries.length === 1 ? '' : 's'}:{' '}
      {entries.map(([uid, share], i) => (
        <Fragment key={uid}>
          {i > 0 ? ' · ' : null}
          <b className="font-medium text-ink">{personName(uid, people)}</b>{' '}
          <span className="font-mono">{formatMinor(share, currency)}</span>
        </Fragment>
      ))}
    </p>
  )
}

/**
 * Edit and Delete for the person who added it. Others are told who can. Once someone in it has
 * left, nobody can change it (their balance is gone), and the row says why.
 */
function Actions({
  expense,
  group,
  people,
  onEdit,
  onDelete,
}: {
  expense: Expense
  group: Group
  people: People
  onEdit: (e: Expense) => void
  onDelete: (e: Expense) => void
}) {
  const gone = peopleInExpense(expense).find((u) => !group.memberIds.includes(u))
  let content: ReactNode
  if (gone) {
    content = (
      <span>
        {group.pastMembers[gone]?.displayName ?? 'Someone'} has left the group, so this can no
        longer be changed.
      </span>
    )
  } else if (expense.createdBy !== people.me) {
    content = <span>Only {personName(expense.createdBy, people)} can edit or delete this.</span>
  } else {
    content = (
      <>
        <Button
          variant="link"
          onClick={() => {
            onEdit(expense)
          }}
        >
          Edit
        </Button>
        <Button
          variant="link"
          className="text-red!"
          onClick={() => {
            onDelete(expense)
          }}
        >
          Delete
        </Button>
      </>
    )
  }
  return <div className="mt-2 flex flex-wrap items-center gap-[18px]">{content}</div>
}

function ReceiptViewer({
  expense,
  currency,
  onClose,
}: {
  expense: Expense
  currency: CurrencyCode
  onClose: () => void
}) {
  const url = useStorageUrl(expense.receiptPath)
  return (
    <Modal
      title="Receipt"
      description={`${expense.title} · ${formatMinor(expense.amountMinor, currency)}`}
      onClose={onClose}
    >
      {url.isPending ? (
        <p className="mt-4 text-muted">Loading the photo…</p>
      ) : url.isError ? (
        <p className="mt-4 text-red">
          Couldn&apos;t load the photo. Check your connection and try again.
        </p>
      ) : (
        <img
          src={url.data}
          alt={`Receipt photo for ${expense.title}`}
          className="mx-auto mt-3.5 block max-h-[60vh] max-w-full border-[1.5px] border-solid border-ink"
        />
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
