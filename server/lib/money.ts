// The one place that knows about currencies and money.
// Two identical copies: src/lib/money.ts (client) and server/lib/money.ts (the API).
// server/lib/money.sync.test.ts fails if they differ, so edit one and copy it over.
//
// Every amount in SplitIt is an integer in the currency's smallest unit (kobo, cents, pence, yen).
// Floats are never used for money: text is parsed digit by digit into integers.

export const CURRENCIES = {
  NGN: { name: 'Nigerian naira', symbol: '₦', exponent: 2, minorName: 'kobo' },
  USD: { name: 'US dollar', symbol: '$', exponent: 2, minorName: 'cent' },
  GBP: { name: 'British pound', symbol: '£', exponent: 2, minorName: 'penny' },
  EUR: { name: 'Euro', symbol: '€', exponent: 2, minorName: 'cent' },
  GHS: { name: 'Ghanaian cedi', symbol: 'GH₵', exponent: 2, minorName: 'pesewa' },
  KES: { name: 'Kenyan shilling', symbol: 'KSh', exponent: 2, minorName: 'cent' },
  ZAR: { name: 'South African rand', symbol: 'R', exponent: 2, minorName: 'cent' },
  CAD: { name: 'Canadian dollar', symbol: 'CA$', exponent: 2, minorName: 'cent' },
  JPY: { name: 'Japanese yen', symbol: '¥', exponent: 0, minorName: 'yen' },
} as const satisfies Record<
  string,
  { name: string; symbol: string; exponent: 0 | 2; minorName: string }
>

export type CurrencyCode = keyof typeof CURRENCIES

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.hasOwn(CURRENCIES, value)
}

// Largest single amount we accept: 100 billion minor units (₦1,000,000,000.00, or ¥100,000,000,000).
// Far above any real shared bill, and far below Number.MAX_SAFE_INTEGER, so sums of many
// amounts stay exact integers.
export const MAX_AMOUNT_MINOR = 100_000_000_000

export type AmountProblem = 'not-integer' | 'not-positive' | 'too-large'

/** Why an amount is not acceptable, or null when it is a positive whole number within limits. */
export function amountProblem(value: unknown): AmountProblem | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 'not-integer'
  if (value <= 0) return 'not-positive'
  if (value > MAX_AMOUNT_MINOR) return 'too-large'
  return null
}

export function isValidAmountMinor(value: unknown): value is number {
  return amountProblem(value) === null
}

/**
 * Formats minor units for display: 3565000 NGN -> "₦35,650", 3565050 -> "₦35,650.50",
 * 450 JPY -> "¥450". Pure integer arithmetic, no floats, and the same output in every locale.
 * Negative amounts get a leading minus; screens that show debts in brackets pass the absolute value.
 */
export function formatMinor(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(amountMinor))
    throw new RangeError('Money must be a whole number of minor units')
  const { symbol, exponent } = CURRENCIES[currency]
  const sign = amountMinor < 0 ? '-' : ''
  const abs = Math.abs(amountMinor)
  const unit = 10 ** exponent
  const whole = (abs - (abs % unit)) / unit
  const fraction = abs % unit
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = fraction === 0 ? '' : `.${String(fraction).padStart(exponent, '0')}`
  return `${sign}${symbol}${grouped}${decimals}`
}

export type ParsedAmount = { ok: true; minor: number } | { ok: false; message: string }

// Whole part: plain digits, or digits grouped in threes with commas ("1,250,000").
const WHOLE = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`

/**
 * Reads what someone typed into a whole number of minor units, without ever using a float:
 * "1,250.50" NGN -> 125050, "₦35,650" -> 3565000, ".5" USD -> 50, "1,000" JPY -> 1000.
 * The currency symbol and spaces are ignored. Commas must group thousands properly.
 * With `allowZero`, an empty box or 0 means 0 (used for custom split shares).
 */
export function parseAmount(
  text: string,
  currency: CurrencyCode,
  opts: { allowZero?: boolean } = {},
): ParsedAmount {
  const { symbol, exponent } = CURRENCIES[currency]
  let s = text.replace(/\s+/g, '')
  if (s.startsWith(symbol)) s = s.slice(symbol.length)
  if (s === '')
    return opts.allowZero ? { ok: true, minor: 0 } : { ok: false, message: 'Enter an amount.' }
  if (s.startsWith('-')) return { ok: false, message: 'Amounts cannot be negative.' }

  if (exponent === 0 && s.includes('.')) {
    return { ok: false, message: 'Yen has no decimals. Enter a whole number, like 1,500.' }
  }
  const match = new RegExp(`^(?:${WHOLE}(?:\\.(\\d*))?|\\.(\\d+))$`).exec(s)
  if (!match) return { ok: false, message: 'Enter a number, like 1,250.50.' }
  const wholeDigits = (match[1] ?? '0').replace(/,/g, '')
  const fractionDigits = match[2] ?? match[3] ?? ''
  if (fractionDigits.length > exponent) {
    return { ok: false, message: `Use at most ${exponent} decimals.` }
  }
  // 12 digits of whole units is already far beyond MAX_AMOUNT_MINOR; stop before Number() loses precision.
  if (wholeDigits.replace(/^0+/, '').length > 12) {
    return { ok: false, message: 'That amount is too large for one expense.' }
  }
  const minor =
    Number(wholeDigits) * 10 ** exponent + Number(fractionDigits.padEnd(exponent, '0') || '0')

  if (minor === 0) {
    return opts.allowZero
      ? { ok: true, minor: 0 }
      : { ok: false, message: 'Enter an amount above zero.' }
  }
  if (minor > MAX_AMOUNT_MINOR)
    return { ok: false, message: 'That amount is too large for one expense.' }
  return { ok: true, minor }
}

/** Minor units back into an editable string, without grouping: 125050 NGN -> "1250.50". */
export function toAmountInput(amountMinor: number, currency: CurrencyCode): string {
  const { exponent } = CURRENCIES[currency]
  const unit = 10 ** exponent
  const fraction = amountMinor % unit
  const whole = (amountMinor - fraction) / unit
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(exponent, '0')}`
}

/**
 * Splits `total` minor units equally between people, in the order given. When it doesn't divide
 * evenly, the leftover units go one each to the first people, so the shares always add up to the
 * total and the same input always gives the same result: 10000 / 3 -> 3334, 3333, 3333.
 */
export function splitEqually(total: number, uids: readonly string[]): Record<string, number> {
  if (uids.length === 0) throw new RangeError('Split between at least one person')
  if (!Number.isSafeInteger(total) || total < 0)
    throw new RangeError('Total must be a whole number')
  const remainder = total % uids.length
  const base = (total - remainder) / uids.length
  return Object.fromEntries(uids.map((uid, i) => [uid, base + (i < remainder ? 1 : 0)]))
}
