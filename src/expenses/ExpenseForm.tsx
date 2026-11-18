import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'
import { expenseTitle } from '../../functions/src/shared/schemas'
import { ACCEPT_ATTR, imageProblem } from '../lib/images'
import {
  CURRENCIES,
  formatMinor,
  parseAmount,
  splitEqually,
  toAmountInput,
  type CurrencyCode,
} from '../lib/money'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Field, labelClass, selectClass } from '../ui/Field'
import { MoneyInput } from './MoneyInput'

export interface FormMember {
  uid: string
  displayName: string
  photoURL: string | null
}

/** What to do with the receipt photo when saving. */
export type ReceiptChoice = { kind: 'keep' } | { kind: 'none' } | { kind: 'new'; file: File }

export interface ExpenseFormValues {
  title: string
  amountMinor: number
  paidBy: string
  splits: Record<string, number>
  receipt: ReceiptChoice
}

interface ExpenseFormProps {
  currency: CurrencyCode
  /** Current members, in the order they joined: equal splits give odd units to the first ones. */
  members: readonly FormMember[]
  me: string
  /** When editing: the saved expense, and a URL for its receipt photo if it has one. */
  initial?: {
    title: string
    amountMinor: number
    paidBy: string
    splits: Record<string, number>
    receiptUrl: string | null
  }
  submitLabel: string
  busy?: boolean
  /** An error from saving (shown under the form). */
  serverError?: string | null
  onSubmit: (values: ExpenseFormValues) => void
  onCancel: () => void
}

type Mode = 'equal' | 'custom'
type Receipt =
  { kind: 'keep'; url: string } | { kind: 'none' } | { kind: 'new'; file: File; url: string }

function isEqualSplit(
  amountMinor: number,
  splits: Record<string, number>,
  order: readonly string[],
): boolean {
  const people = order.filter((u) => u in splits)
  if (people.length !== Object.keys(splits).length) return false
  const equal = splitEqually(amountMinor, people)
  return people.every((u) => equal[u] === splits[u])
}

/**
 * The add/edit expense form: title, amount, who paid, and who it was for, split equally or in
 * custom amounts that must add up to the total, plus an optional receipt photo.
 * It only gathers and checks; the dialog around it uploads and saves.
 */
export function ExpenseForm({
  currency,
  members,
  me,
  initial,
  submitLabel,
  busy = false,
  serverError,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const paidById = useId()
  const splitLabelId = useId()
  const receiptLabelId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const order = members.map((m) => m.uid)
  const { minorName } = CURRENCIES[currency]

  const [title, setTitle] = useState(initial?.title ?? '')
  const [amountText, setAmountText] = useState(
    initial ? toAmountInput(initial.amountMinor, currency) : '',
  )
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? me)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial ? Object.keys(initial.splits) : order),
  )
  const [mode, setMode] = useState<Mode>(
    initial && !isEqualSplit(initial.amountMinor, initial.splits, order) ? 'custom' : 'equal',
  )
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    initial
      ? Object.fromEntries(
          Object.entries(initial.splits).map(([u, v]) => [u, toAmountInput(v, currency)]),
        )
      : {},
  )
  const [receipt, setReceipt] = useState<Receipt>(
    initial?.receiptUrl ? { kind: 'keep', url: initial.receiptUrl } : { kind: 'none' },
  )
  const [titleError, setTitleError] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)

  // Free a picked photo's preview when it is replaced or the form closes.
  useEffect(() => {
    if (receipt.kind !== 'new') return
    return () => {
      URL.revokeObjectURL(receipt.url)
    }
  }, [receipt])

  // ---- what the numbers currently mean ----
  const amount = parseAmount(amountText, currency)
  const amountMinor = amount.ok ? amount.minor : null
  const people = order.filter((u) => selected.has(u))
  const equalShares =
    amountMinor !== null && people.length > 0 ? splitEqually(amountMinor, people) : null
  const customParsed = people.map(
    (u) => [u, parseAmount(custom[u] ?? '', currency, { allowZero: true })] as const,
  )
  const customBad = customParsed.some(([, p]) => !p.ok)
  const customSum = customParsed.reduce((sum, [, p]) => sum + (p.ok ? p.minor : 0), 0)

  function customStatus(): string {
    if (amountMinor === null) return 'Enter the amount first.'
    if (customBad) return "One of the amounts isn't a number. Check the boxes in red."
    const left = amountMinor - customSum
    if (left === 0) return `Every ${minorName} is assigned.`
    return left > 0
      ? `${formatMinor(left, currency)} left to assign.`
      : `${formatMinor(-left, currency)} too much.`
  }

  const unevenEqual = equalShares !== null && new Set(Object.values(equalShares)).size > 1

  function toggle(uid: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(uid)
      else next.delete(uid)
      return next
    })
  }

  function switchMode(next: Mode) {
    // Starting custom amounts from the equal shares saves typing for small changes.
    if (next === 'custom' && equalShares && people.every((u) => !custom[u])) {
      setCustom(
        Object.fromEntries(people.map((u) => [u, toAmountInput(equalShares[u] ?? 0, currency)])),
      )
    }
    setMode(next)
  }

  function onPickReceipt(file: File | undefined) {
    if (!file) return
    const problem = imageProblem(file)
    setReceiptError(problem)
    if (!problem) setReceipt({ kind: 'new', file, url: URL.createObjectURL(file) })
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const t = expenseTitle.safeParse(title)
    setTitleError(t.success ? null : (t.error.issues[0]?.message ?? 'Give it a title.'))
    setAmountError(amount.ok ? null : amount.message)
    setFormError(null)
    if (!t.success || amountMinor === null) return
    if (people.length === 0) {
      setFormError('Tick at least one person to split with.')
      return
    }

    let splits: Record<string, number>
    if (mode === 'equal') {
      splits = splitEqually(amountMinor, people)
    } else {
      if (customBad) {
        setFormError("One of the amounts isn't a number. Check the boxes in red.")
        return
      }
      splits = Object.fromEntries(
        customParsed.flatMap(([u, p]) => (p.ok && p.minor > 0 ? [[u, p.minor]] : [])),
      )
      if (customSum !== amountMinor) {
        setFormError(
          customSum < amountMinor
            ? `${formatMinor(amountMinor - customSum, currency)} is still unassigned. Custom amounts must add up to the total.`
            : `Custom amounts are ${formatMinor(customSum - amountMinor, currency)} over the total.`,
        )
        return
      }
      if (Object.keys(splits).length === 0) {
        setFormError('Give at least one person an amount.')
        return
      }
    }

    onSubmit({
      title: t.data,
      amountMinor,
      paidBy,
      splits,
      receipt:
        receipt.kind === 'new' ? { kind: 'new', file: receipt.file } : { kind: receipt.kind },
    })
  }

  const nameOf = (m: FormMember) => (m.uid === me ? 'You' : m.displayName)

  return (
    <form noValidate onSubmit={submit}>
      <Field
        label="What was it for?"
        placeholder="Suya and drinks"
        autoComplete="off"
        maxLength={80}
        value={title}
        error={titleError}
        onChange={(e) => {
          setTitle(e.target.value)
        }}
      />

      <div className="grid grid-cols-2 gap-[18px] max-[540px]:grid-cols-1">
        <MoneyInput
          label="Amount"
          currency={currency}
          value={amountText}
          error={amountError}
          onChange={(text) => {
            setAmountText(text)
          }}
        />
        <div>
          <label htmlFor={paidById} className={labelClass}>
            Paid by
          </label>
          <select
            id={paidById}
            className={selectClass}
            value={paidBy}
            onChange={(e) => {
              setPaidBy(e.target.value)
            }}
          >
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {nameOf(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-[22px] flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1">
        <span id={splitLabelId} className="text-[.82rem] font-semibold tracking-[.02em] text-muted">
          Split between
        </span>
        <div role="group" aria-label="Split type" className="flex gap-3.5">
          {(
            [
              ['equal', 'Equally'],
              ['custom', 'Custom amounts'],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                switchMode(value)
              }}
              className={`border-b-2 border-solid text-[.9rem] font-semibold ${
                mode === value ? 'border-biro text-ink' : 'border-transparent text-muted'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <ul aria-labelledby={splitLabelId}>
        {members.map((m) => {
          const on = selected.has(m.uid)
          const parsed = customParsed.find(([u]) => u === m.uid)?.[1]
          return (
            <li
              key={m.uid}
              className="flex items-center gap-3 border-b border-rule px-0.5 py-[9px]"
            >
              <input
                id={`split-${m.uid}`}
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  toggle(m.uid, e.target.checked)
                }}
                className="size-[18px] accent-biro"
              />
              <Avatar
                seed={m.uid}
                name={m.displayName}
                photoUrl={m.photoURL}
                size="sm"
                decorative
              />
              <label
                htmlFor={`split-${m.uid}`}
                className={`flex-1 cursor-pointer font-medium ${on ? 'text-ink' : 'text-muted line-through'}`}
              >
                {nameOf(m)}
              </label>
              {mode === 'custom' && on ? (
                <MoneyInput
                  size="sm"
                  currency={currency}
                  allowZero
                  ariaLabel={`Amount for ${nameOf(m)}`}
                  value={custom[m.uid] ?? ''}
                  invalid={parsed !== undefined && !parsed.ok}
                  onChange={(text) => {
                    setCustom((c) => ({ ...c, [m.uid]: text }))
                  }}
                />
              ) : (
                <span
                  data-testid={`share-${m.uid}`}
                  className={`font-mono text-[.92em] ${on ? '' : 'text-muted line-through'}`}
                >
                  {on && equalShares ? formatMinor(equalShares[m.uid] ?? 0, currency) : '—'}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p aria-live="polite" className="mt-2 text-[.88rem] text-muted">
        {mode === 'custom'
          ? customStatus()
          : unevenEqual
            ? `The odd ${minorName} goes to the first names so the total always matches.`
            : 'Untick anyone who was not part of it.'}
      </p>

      <div className="mt-[22px] flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1">
        <span
          id={receiptLabelId}
          className="text-[.82rem] font-semibold tracking-[.02em] text-muted"
        >
          Receipt photo (optional)
        </span>
      </div>
      <div aria-labelledby={receiptLabelId} className="mt-2.5 flex items-center gap-4">
        {receipt.kind === 'none' ? (
          <div>
            <Button
              onClick={() => {
                fileInput.current?.click()
              }}
            >
              Choose a photo
            </Button>
            <p className="mt-2 text-[.88rem] text-muted">
              Stored privately. Only group members can open it.
            </p>
          </div>
        ) : (
          <>
            <img
              src={receipt.url}
              alt="Receipt preview"
              className="size-[72px] rounded-tick border-[1.5px] border-solid border-ink object-cover"
            />
            <Button
              variant="link"
              onClick={() => {
                setReceipt({ kind: 'none' })
              }}
            >
              Remove photo
            </Button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            onPickReceipt(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {receiptError ? <p className="mt-2 text-[.9rem] text-red">{receiptError}</p> : null}

      <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
        {formError ?? serverError}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2.5">
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
