// Search runs in the browser, over groups and expenses already loaded on this device.
// Firestore has no "contains" search for text, so there is no server query for this.

export interface SearchGroup {
  id: string
  name: string
}

export interface SearchExpense {
  id: string
  title: string
  amountMinor: number
}

export type SearchResult<G extends SearchGroup, E extends SearchExpense> =
  { kind: 'group'; group: G } | { kind: 'expense'; group: G; expense: E }

const MAX_RESULTS = 20

/** Lower case, no accents, single spaces: "Café  Ọja" and "cafe oja" compare equal. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Every word typed must appear somewhere in the text, in any order. */
function matches(haystack: string, words: readonly string[]): boolean {
  const h = normalise(haystack)
  return words.every((w) => h.includes(w))
}

/**
 * Groups first, then expenses (newest groups and newest expenses first, as given).
 * With nothing typed, it lists your groups, like the prototype.
 */
export function search<G extends SearchGroup, E extends SearchExpense>(
  text: string,
  groups: readonly G[],
  expensesByGroup: ReadonlyMap<string, readonly E[]>,
): SearchResult<G, E>[] {
  const words = normalise(text).split(' ').filter(Boolean)
  const results: SearchResult<G, E>[] = []
  for (const group of groups) {
    if (words.length === 0 || matches(group.name, words)) results.push({ kind: 'group', group })
  }
  if (words.length > 0) {
    for (const group of groups) {
      for (const expense of expensesByGroup.get(group.id) ?? []) {
        if (matches(expense.title, words)) results.push({ kind: 'expense', group, expense })
      }
    }
  }
  return results.slice(0, MAX_RESULTS)
}
