/** Firestore allows at most 500 writes in one batch. */
export const MAX_BATCH_WRITES = 500

/** Splits a list into consecutive pieces of at most `size` items, keeping the order. */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
