import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeKeys, retain } from './registry'

const releases: (() => void)[] = []
afterEach(() => {
  releases.splice(0).forEach((r) => {
    r()
  })
})

function hold(key: string, start: () => () => void) {
  const release = retain(key, start)
  releases.push(release)
  return release
}

describe('retain', () => {
  it('starts a subscription once however many times it is asked for', () => {
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    hold('group:g1', start)
    hold('group:g1', start)
    hold('group:g1', start)
    expect(start).toHaveBeenCalledTimes(1)
    expect(activeKeys()).toEqual(['group:g1'])
  })

  it('stops only when the last holder releases', () => {
    const stop = vi.fn()
    const a = hold('group:g1', () => stop)
    const b = hold('group:g1', () => stop)
    a()
    expect(stop).not.toHaveBeenCalled()
    b()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(activeKeys()).toEqual([])
  })

  it('ignores a second release from the same holder', () => {
    const stop = vi.fn()
    const a = hold('group:g1', () => stop)
    hold('group:g1', () => stop)
    a()
    a() // must not release the other holder's share
    expect(stop).not.toHaveBeenCalled()
  })

  it('survives a StrictMode-style mount, unmount, mount without leaving duplicates', () => {
    const starts: string[] = []
    const stops: string[] = []
    const start = () => {
      starts.push('g1')
      return () => {
        stops.push('g1')
      }
    }
    const first = hold('group:g1', start)
    first() // StrictMode cleanup
    hold('group:g1', start) // and mount again
    expect(starts).toHaveLength(2)
    expect(stops).toHaveLength(1)
    expect(activeKeys()).toEqual(['group:g1']) // exactly one live
  })

  it('keeps different keys apart, as when navigating from one group to another', () => {
    const g1 = hold('group:g1', () => vi.fn())
    hold('group:g2', () => vi.fn())
    g1()
    expect(activeKeys()).toEqual(['group:g2'])
  })
})
