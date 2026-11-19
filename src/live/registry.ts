// Shared, reference-counted subscriptions. Several screens (or React StrictMode's double mount)
// can ask for the same live data; the subscription starts once, and stops when the last one lets go.

type Stop = () => void

interface Entry {
  count: number
  stop: Stop
}

const active = new Map<string, Entry>()

/**
 * Starts `start()` the first time `key` is asked for, and returns a release function. The
 * subscription stops when every holder has released it. Releasing twice is harmless.
 */
export function retain(key: string, start: () => Stop): () => void {
  let entry = active.get(key)
  if (entry) {
    entry.count += 1
  } else {
    entry = { count: 1, stop: start() }
    active.set(key, entry)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    const current = active.get(key)
    if (!current) return
    current.count -= 1
    if (current.count === 0) {
      active.delete(key)
      current.stop()
    }
  }
}

/** Keys with a live subscription right now (for tests and the dev console). */
export function activeKeys(): string[] {
  return [...active.keys()]
}
