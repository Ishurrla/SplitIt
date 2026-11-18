import { useState, type SyntheticEvent } from 'react'
import { MoneyInput } from '../expenses/MoneyInput'
import { personName, type People } from '../groups/people'
import type { Group } from '../groups/types'
import { callableErrorMessage, recordPayment } from '../lib/callables'
import { formatMinor, parseAmount, toAmountInput } from '../lib/money'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { Transfer } from './types'

interface PaymentDialogProps {
  group: Group
  /** The line from the settle-up plan being paid. Its amount is the most this dialog offers. */
  transfer: Transfer
  people: People
  onClose: () => void
  /** Called after the payment is saved, with the amount actually recorded. */
  onRecorded: (amountMinor: number) => void
}

/**
 * Record that money moved, in full or in part. The dialog offers at most the plan's amount; the
 * recordPayment function separately refuses anything above what is owed at that moment.
 */
export function PaymentDialog({
  group,
  transfer,
  people,
  onClose,
  onRecorded,
}: PaymentDialogProps) {
  const currency = group.currency
  const full = transfer.amountMinor
  const [text, setText] = useState(toAmountInput(full, currency))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = personName(transfer.from, people)
  const to = personName(transfer.to, people)

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseAmount(text, currency)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    if (parsed.minor > full) {
      setError(`That is more than the ${formatMinor(full, currency)} owed. Lower the amount.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await recordPayment({
        groupId: group.id,
        from: transfer.from,
        to: transfer.to,
        amountMinor: parsed.minor,
      })
    } catch (e) {
      setError(callableErrorMessage(e))
      setBusy(false)
      return
    }
    onRecorded(parsed.minor)
  }

  return (
    <Modal
      title="Record a payment"
      description={
        <>
          <b className="text-ink">{from}</b> {transfer.from === people.me ? 'pay' : 'pays'}{' '}
          <b className="text-ink">{to === 'You' ? 'you' : to}</b>. Lower the amount if it was only
          part of the debt.
        </>
      }
      onClose={onClose}
    >
      <form noValidate onSubmit={(e) => void submit(e)}>
        <MoneyInput
          label="Amount paid"
          currency={currency}
          value={text}
          error={error}
          onChange={(next) => {
            setText(next)
          }}
        />
        <p className="mt-2 text-[.88rem] text-muted">
          Full debt: <span className="font-mono">{formatMinor(full, currency)}</span>
        </p>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
