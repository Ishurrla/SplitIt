import { describe, expect, it } from 'vitest'
import { MAX_BATCH_WRITES, chunks } from './chunks.js'

describe('chunks', () => {
  it('returns nothing for an empty list', () => {
    expect(chunks([], 3)).toEqual([])
  })

  it('keeps order and puts the remainder in the last piece', () => {
    expect(chunks([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('splits 1001 writes into 500 + 500 + 1', () => {
    const sizes = chunks(
      Array.from({ length: 1001 }, (_, i) => i),
      MAX_BATCH_WRITES,
    ).map((c) => c.length)
    expect(sizes).toEqual([500, 500, 1])
  })

  it('rejects a size that is not a positive integer', () => {
    expect(() => chunks([1], 0)).toThrow(RangeError)
    expect(() => chunks([1], 1.5)).toThrow(RangeError)
  })
})
