// A per-person call limit, kept in this server instance's memory.
//
// Best effort only: Vercel runs several instances that don't share memory, so the real limit is
// a multiple of this. It stops one runaway browser tab or a simple loop, not a determined attacker.
// The hard backstop is Firestore's daily free quota on the Spark plan (README, Known limitations).

const WINDOW_MS = 60_000

function limitPerMinute(): number {
  const configured = Number(process.env.API_RATE_LIMIT_PER_MINUTE)
  return Number.isInteger(configured) && configured > 0 ? configured : 120
}

const windows = new Map<string, { start: number; count: number }>()

/** Counts one call for `uid`. False when they are over the limit for the current minute. */
export function allowCall(uid: string, now = Date.now()): boolean {
  if (windows.size > 10_000) {
    for (const [key, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(key)
  }
  const w = windows.get(uid)
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(uid, { start: now, count: 1 })
    return true
  }
  w.count += 1
  return w.count <= limitPerMinute()
}
