import { useQueryClient } from '@tanstack/react-query'
import { collection, doc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { useState } from 'react'
import { refreshGroup, useStorageUrl } from '../groups/queries'
import type { Group, Member } from '../groups/types'
import { callableErrorMessage, saveExpense } from '../lib/callables'
import { db, storage } from '../lib/firebase'
import { newPhotoName, resizeToJpeg } from '../lib/images'
import { formatMinor } from '../lib/money'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'
import { ExpenseForm, type ExpenseFormValues } from './ExpenseForm'
import type { Expense } from './types'

interface ExpenseModalProps {
  group: Group
  members: readonly Member[]
  me: string
  /** The expense being edited; omit to add a new one. */
  expense?: Expense
  onClose: () => void
}

/**
 * Add or edit an expense. A new expense gets its id here, before saving, so its receipt can be
 * uploaded to receipts/{groupId}/{expenseId}/ first; saveExpense then checks the photo is there.
 */
export function ExpenseModal({ group, members, me, expense, onClose }: ExpenseModalProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const receipt = useStorageUrl(expense?.receiptPath ?? null)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function onSubmit(values: ExpenseFormValues) {
    setBusy(true)
    setServerError(null)
    const expenseId = expense?.id ?? doc(collection(db, 'groups', group.id, 'expenses')).id
    let receiptPath: string | null
    try {
      if (values.receipt.kind === 'new') {
        const path = `receipts/${group.id}/${expenseId}/${newPhotoName()}`
        await uploadBytes(ref(storage, path), await resizeToJpeg(values.receipt.file), {
          contentType: 'image/jpeg',
        })
        receiptPath = path
      } else {
        receiptPath = values.receipt.kind === 'keep' ? (expense?.receiptPath ?? null) : null
      }
    } catch {
      setServerError(
        "The receipt photo didn't upload. Try again, or remove the photo and save without it.",
      )
      setBusy(false)
      return
    }
    try {
      await saveExpense({
        groupId: group.id,
        expenseId,
        title: values.title,
        amountMinor: values.amountMinor,
        paidBy: values.paidBy,
        splits: values.splits,
        receiptPath,
      })
    } catch (e) {
      setServerError(callableErrorMessage(e))
      setBusy(false)
      return
    }
    await refreshGroup(queryClient, group.id)
    onClose()
    toast(
      expense
        ? `Updated ${values.title}.`
        : `Added ${values.title}, ${formatMinor(values.amountMinor, group.currency)}.`,
    )
  }

  const formMembers = members.map((m) => ({
    uid: m.uid,
    displayName: m.displayName,
    photoURL: m.photoURL,
  }))

  return (
    <Modal
      title={expense ? 'Edit expense' : 'Add an expense'}
      description={
        expense
          ? 'Balances update for everyone as soon as you save.'
          : `Everyone in ${group.name} sees it right away.`
      }
      onClose={onClose}
    >
      {expense?.receiptPath && receipt.isPending ? (
        // Wait for the photo, or the form would open without it and saving would remove it.
        <p className="mt-6 text-muted">Loading the expense…</p>
      ) : expense?.receiptPath && receipt.isError ? (
        <div className="mt-6">
          <p className="text-red">
            Couldn&apos;t load the receipt photo, so editing is paused to keep it safe.
          </p>
          <Button className="mt-3" onClick={() => void receipt.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ExpenseForm
          currency={group.currency}
          members={formMembers}
          me={me}
          initial={
            expense
              ? {
                  title: expense.title,
                  amountMinor: expense.amountMinor,
                  paidBy: expense.paidBy,
                  splits: expense.splits,
                  receiptUrl: receipt.data ?? null,
                }
              : undefined
          }
          submitLabel={expense ? 'Save changes' : 'Add expense'}
          busy={busy}
          serverError={serverError}
          onSubmit={(v) => void onSubmit(v)}
          onCancel={onClose}
        />
      )}
    </Modal>
  )
}
