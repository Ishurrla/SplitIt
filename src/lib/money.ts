// The one place that knows about currencies and money limits.
// Two identical copies: src/lib/money.ts (client) and functions/src/lib/money.ts (Cloud Functions).
// src/lib/money.sync.test.ts fails if they differ, so edit one and copy it over.
//
// Every amount in SplitIt is an integer in the currency's smallest unit (kobo, cents, pence, yen).
// Floats are never used for money.

export const CURRENCIES = {
  NGN: { name: 'Nigerian naira', symbol: '₦', exponent: 2 },
  USD: { name: 'US dollar', symbol: '$', exponent: 2 },
  GBP: { name: 'British pound', symbol: '£', exponent: 2 },
  EUR: { name: 'Euro', symbol: '€', exponent: 2 },
  GHS: { name: 'Ghanaian cedi', symbol: 'GH₵', exponent: 2 },
  KES: { name: 'Kenyan shilling', symbol: 'KSh', exponent: 2 },
  ZAR: { name: 'South African rand', symbol: 'R', exponent: 2 },
  CAD: { name: 'Canadian dollar', symbol: 'CA$', exponent: 2 },
  JPY: { name: 'Japanese yen', symbol: '¥', exponent: 0 },
} as const satisfies Record<string, { name: string; symbol: string; exponent: 0 | 2 }>

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
  const whole = Math.trunc(abs / unit)
  const fraction = abs % unit
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = fraction === 0 ? '' : `.${String(fraction).padStart(exponent, '0')}`
  return `${sign}${symbol}${grouped}${decimals}`
}
