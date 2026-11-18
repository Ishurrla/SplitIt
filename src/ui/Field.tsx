import { useId, type InputHTMLAttributes } from 'react'

export const labelClass =
  'mt-[18px] mb-0.5 block text-[.82rem] font-semibold tracking-[.02em] text-muted'
export const inputClass =
  'w-full rounded-none border-0 border-b-[1.5px] border-solid border-ink bg-transparent px-0.5 py-2 text-ink focus:border-biro focus:bg-wash focus:outline-none aria-invalid:border-red'

/** A <select> drawn like the text fields, with the prototype's small chevron. */
export const selectClass = `${inputClass} appearance-none bg-[linear-gradient(45deg,transparent_50%,var(--color-ink)_50%),linear-gradient(135deg,var(--color-ink)_50%,transparent_50%)] bg-[position:calc(100%-12px)_55%,calc(100%-7px)_55%] bg-[size:5px_5px] bg-no-repeat pr-6`

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Shown under the input in red, and announced. */
  error?: string | null | undefined
  hint?: string | undefined
}

/** A labelled text input in the ledger style: a single pen line under the text. */
export function Field({ label, error, hint, id, ...input }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      <input
        id={inputId}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="mt-2 text-[.88rem] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-2 text-[.9rem] text-red">
          {error}
        </p>
      ) : null}
    </div>
  )
}
