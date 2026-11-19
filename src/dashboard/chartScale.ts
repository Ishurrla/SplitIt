import { CURRENCIES, type CurrencyCode } from '../lib/money'

// Axis arithmetic for the spending chart, in integer minor units (no floats for money).

const NICE = [10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100]

/**
 * A round number at or above `max` for the top of the axis: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8
 * or 10 times a power of ten, in whole units of the currency. Never below one whole unit.
 */
export function niceTop(maxMinor: number, currency: CurrencyCode): number {
  const unit = 10 ** CURRENCIES[currency].exponent
  const target = Math.max(maxMinor, unit)
  let scale = unit
  while (scale * 10 < target) scale *= 10
  // Now scale < target <= scale * 10: pick the first nice step in that decade that reaches it.
  for (const n of NICE) {
    const candidate = (scale * n) / 10
    if (candidate >= target && Number.isSafeInteger(candidate)) return candidate
  }
  return scale * 10
}

/** "₦48k", "₦1.2M", "£350", "¥4.5k": short axis labels, built from integers only. */
export function compactMinor(amountMinor: number, currency: CurrencyCode): string {
  const { symbol, exponent } = CURRENCIES[currency]
  const unit = 10 ** exponent
  const whole = (amountMinor - (amountMinor % unit)) / unit
  const short = (value: number, size: number, suffix: string) => {
    const tenths = Math.round((value * 10) / size)
    const rest = tenths % 10
    return `${symbol}${(tenths - rest) / 10}${rest ? `.${rest}` : ''}${suffix}`
  }
  if (whole >= 1_000_000) return short(whole, 1_000_000, 'M')
  if (whole >= 1_000) return short(whole, 1_000, 'k')
  return `${symbol}${whole}`
}
