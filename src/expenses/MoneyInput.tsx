import { useId } from 'react'
import { CURRENCIES, parseAmount, type CurrencyCode, type ParsedAmount } from '../lib/money'
import { labelClass } from '../ui/Field'

interface MoneyInputProps {
  currency: CurrencyCode
  /** The text as typed. The parent keeps it, so "1,250.5" stays exactly as entered while editing. */
  value: string
  /** Called with the new text and what it means in minor units (or why it means nothing). */
  onChange: (text: string, parsed: ParsedAmount) => void
  /** Visible label; omit and pass `ariaLabel` for the small per-person boxes. */
  label?: string
  ariaLabel?: string
  /** An empty box means 0 (custom split shares) instead of "Enter an amount". */
  allowZero?: boolean
  error?: string | null
  /** Mark the box as wrong without a message (the form explains once, below the list). */
  invalid?: boolean
  size?: 'md' | 'sm'
  id?: string
}

/**
 * Money field in the ledger style: the currency symbol, then the amount on a pen line.
 * Text is turned into integer minor units by parseAmount, never through a float.
 */
export function MoneyInput({
  currency,
  value,
  onChange,
  label,
  ariaLabel,
  allowZero = false,
  error,
  invalid = false,
  size = 'md',
  id,
}: MoneyInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  const { symbol, exponent } = CURRENCIES[currency]
  const small = size === 'sm'
  const wrong = invalid || Boolean(error)

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className={labelClass}>
          {label}
        </label>
      ) : null}
      <div
        className={`flex items-baseline border-b-[1.5px] border-solid focus-within:border-biro focus-within:bg-wash ${
          wrong ? 'border-red' : 'border-ink'
        } ${small ? 'w-[130px]' : ''}`}
      >
        <span aria-hidden="true" className="pr-1 font-mono text-muted">
          {symbol}
        </span>
        <input
          id={inputId}
          aria-label={label ? undefined : ariaLabel}
          // Yen has no decimals, so phones can show the plain number pad.
          inputMode={exponent === 0 ? 'numeric' : 'decimal'}
          autoComplete="off"
          placeholder={exponent === 0 ? '0' : '0.00'}
          value={value}
          aria-invalid={wrong ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            onChange(e.target.value, parseAmount(e.target.value, currency, { allowZero }))
          }}
          className={`w-full border-0 bg-transparent px-0.5 font-mono text-ink focus:outline-none ${small ? 'py-[3px]' : 'py-2'}`}
        />
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-[.85rem] text-red">
          {error}
        </p>
      ) : null}
    </div>
  )
}
