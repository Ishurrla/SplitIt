// Settle-up: turn a group's balances into a short list of payments that clears them.
//
// Greedy "largest creditor, largest debtor": repeatedly match whoever is owed the most with whoever
// owes the most, for the smaller of the two amounts. Each step clears at least one person, so with
// n people who are not already at zero there are at most n - 1 payments.
//
// Finding the truly fewest payments is NP-hard (it contains subset-sum: you would have to find
// groups of people whose balances cancel out among themselves), so exact answers mean trying
// exponentially many groupings. Greedy runs in O(n² ) for a group of at most 50, is never worse
// than n - 1, and is usually optimal or one payment off for real groups.

export interface Transfer {
  from: string
  to: string
  amountMinor: number
}

interface Party {
  uid: string
  amount: number
}

/** Largest amount first; equal amounts by uid, so the same balances always give the same plan. */
function biggest(parties: Party[]): Party | undefined {
  let best: Party | undefined
  for (const p of parties) {
    if (!best || p.amount > best.amount || (p.amount === best.amount && p.uid < best.uid)) best = p
  }
  return best
}

export function settle(balances: Readonly<Record<string, number>>): Transfer[] {
  let sum = 0
  for (const [uid, amount] of Object.entries(balances)) {
    if (!Number.isSafeInteger(amount))
      throw new RangeError(`Balance for ${uid} is not a whole number`)
    sum += amount
  }
  if (sum !== 0) throw new RangeError(`Balances must add up to zero, got ${sum}`)

  const creditors: Party[] = []
  const debtors: Party[] = []
  for (const [uid, amount] of Object.entries(balances)) {
    if (amount > 0) creditors.push({ uid, amount })
    else if (amount < 0) debtors.push({ uid, amount: -amount })
  }

  const transfers: Transfer[] = []
  for (;;) {
    const creditor = biggest(creditors)
    const debtor = biggest(debtors)
    if (!creditor || !debtor) break
    const amountMinor = Math.min(creditor.amount, debtor.amount)
    transfers.push({ from: debtor.uid, to: creditor.uid, amountMinor })
    creditor.amount -= amountMinor
    debtor.amount -= amountMinor
    if (creditor.amount === 0) creditors.splice(creditors.indexOf(creditor), 1)
    if (debtor.amount === 0) debtors.splice(debtors.indexOf(debtor), 1)
  }
  return transfers
}
