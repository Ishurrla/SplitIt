import { describe, expect, it } from 'vitest'
import { authUrlFor, safeNext } from './safeNext'

describe('safeNext', () => {
  it('keeps paths inside the app', () => {
    expect(safeNext('/join/abc123')).toBe('/join/abc123')
    expect(safeNext('/app/groups/g1?tab=x')).toBe('/app/groups/g1?tab=x')
  })

  it('falls back when there is nothing', () => {
    expect(safeNext(null)).toBe('/app')
    expect(safeNext('')).toBe('/app')
  })

  it('refuses other sites', () => {
    expect(safeNext('https://evil.example')).toBe('/app')
    expect(safeNext('//evil.example/x')).toBe('/app')
    expect(safeNext('/\\evil.example')).toBe('/app')
    expect(safeNext('javascript:alert(1)')).toBe('/app')
  })

  it('does not loop back to the sign-in page', () => {
    expect(safeNext('/auth')).toBe('/app')
    expect(safeNext('/auth?next=/app')).toBe('/app')
  })
})

describe('authUrlFor', () => {
  it('round-trips through safeNext', () => {
    const url = new URL(authUrlFor('/join/tok 1'), 'http://x')
    expect(url.pathname).toBe('/auth')
    expect(safeNext(url.searchParams.get('next'))).toBe('/join/tok 1')
  })

  it('can open the sign-up tab', () => {
    expect(new URL(authUrlFor('/join/t', 'signup'), 'http://x').searchParams.get('mode')).toBe(
      'signup',
    )
  })
})
