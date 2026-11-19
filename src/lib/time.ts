/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date: the prototype's wording. */
export function ago(thenMs: number, nowMs: number = Date.now()): string {
  const minutes = Math.round((nowMs - thenMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return new Date(thenMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
