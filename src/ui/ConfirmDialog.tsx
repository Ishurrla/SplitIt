import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  /** Runs the action. Return an error message to show it and keep the dialog open. */
  onConfirm: () => Promise<string | null>
  onClose: () => void
}

/** "Are you sure?" with the action's own wording, its error shown in place, and a busy state. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const problem = await onConfirm()
    if (problem) {
      setError(problem)
      setBusy(false)
    }
  }

  return (
    <Modal title={title} description={description} onClose={onClose}>
      <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
        {error}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2.5">
        <Button variant="link" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? 'One moment…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
