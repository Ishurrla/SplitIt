import { describe, expect, it } from 'vitest'
import { ago } from './time'

const now = Date.UTC(2026, 10, 18, 12, 0, 0)
const minutes = (n: number) => now - n * 60_000

describe('ago', () => {
  it('reads like the prototype', () => {
    expect(ago(now, now)).toBe('just now')
    expect(ago(minutes(5), now)).toBe('5 min ago')
    expect(ago(minutes(180), now)).toBe('3 h ago')
    expect(ago(minutes(24 * 60), now)).toBe('yesterday')
    expect(ago(minutes(4 * 24 * 60), now)).toBe('4 days ago')
  })

  it('switches to a date after two weeks', () => {
    expect(ago(minutes(30 * 24 * 60), now)).toBe('19 Oct')
  })

  it('treats a time slightly in the future as just now', () => {
    expect(ago(now + 5_000, now)).toBe('just now')
  })
})
