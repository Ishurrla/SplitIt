import { formatMinor, type CurrencyCode } from '../lib/money'

/**
 * The ledger's way of writing an effect or a balance: "+₦66.66" when it is in your favour,
 * "(₦33.33)" in red when it is owed, "—" for nothing.
 */
export function SignedAmount({ amount, currency }: { amount: number; currency: CurrencyCode }) {
  if (amount > 0)
    return (
      <span className="font-mono text-[.92em] font-medium">+{formatMinor(amount, currency)}</span>
    )
  if (amount < 0)
    return (
      <span className="font-mono text-[.92em] text-red">({formatMinor(-amount, currency)})</span>
    )
  return <span className="font-mono text-[.92em] text-muted">—</span>
}
