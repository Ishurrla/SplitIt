import { expect } from 'vitest'
import { admin, client, read, type TestClient } from './harness'

// Group set-ups and checks shared by the expense and payment suites.

export type Splits = Record<string, number>

let idCounter = 0
/** A 20-character id in the Firestore auto-id style, as the client makes them. */
export function newId(): string {
  idCounter += 1
  return `exp${String(idCounter).padStart(4, '0')}${'x'.repeat(13)}`
}

/** A group whose first person is owner; everyone else joins with the group's link. */
export async function setupGroup(names: string[], currency = 'NGN') {
  const people: TestClient[] = []
  for (const name of names) people.push(await client({ profile: name }))
  const [owner, ...rest] = people as [TestClient, ...TestClient[]]
  const { groupId } = (await owner.call('createGroup', {
    name: 'Ledger',
    currency,
    cover: 'plain',
  })) as {
    groupId: string
  }
  const { token } = (await owner.call('createInvite', { groupId })) as { token: string }
  for (const p of rest) await p.call('acceptInvite', { token })
  return { groupId, people }
}

export function save(
  c: TestClient,
  groupId: string,
  e: {
    expenseId?: string
    title?: string
    amountMinor: number
    paidBy: string
    splits: Splits
    receiptPath?: string | null
  },
) {
  return c.call('saveExpense', {
    groupId,
    expenseId: e.expenseId ?? newId(),
    title: e.title ?? 'Suya and drinks',
    amountMinor: e.amountMinor,
    paidBy: e.paidBy,
    splits: e.splits,
    receiptPath: e.receiptPath ?? null,
  }) as Promise<{ expenseId: string; created: boolean }>
}

export function pay(
  c: TestClient,
  groupId: string,
  from: TestClient | string,
  to: TestClient | string,
  amountMinor: number,
) {
  return c.call('recordPayment', {
    groupId,
    from: typeof from === 'string' ? from : from.uid,
    to: typeof to === 'string' ? to : to.uid,
    amountMinor,
  }) as Promise<{ paymentId: string }>
}

export const balancesOf = async (groupId: string) =>
  (await read(`groups/${groupId}`))?.balances as Record<string, number>

/**
 * Balances rebuilt from the raw expense and payment documents, independently of the functions'
 * own arithmetic. Only current members are listed.
 */
export async function rebuiltBalances(groupId: string): Promise<Record<string, number>> {
  const group = await read(`groups/${groupId}`)
  const members = group?.memberIds as string[]
  const net: Record<string, number> = {}
  const add = (uid: string, v: number) => {
    net[uid] = (net[uid] ?? 0) + v
  }
  const [expenses, payments] = await admin(async (db) => [
    (await db.collection(`groups/${groupId}/expenses`).get()).docs.map((d) => d.data()),
    (await db.collection(`groups/${groupId}/payments`).get()).docs.map((d) => d.data()),
  ])
  for (const e of expenses) {
    add(e.paidBy as string, e.amountMinor as number)
    for (const [u, share] of Object.entries(e.splits as Splits)) add(u, -share)
  }
  for (const p of payments) {
    add(p.from as string, p.amountMinor as number)
    add(p.to as string, -(p.amountMinor as number))
  }
  for (const [uid, v] of Object.entries(net)) {
    if (!members.includes(uid)) expect(v, `someone who left (${uid}) should net to zero`).toBe(0)
  }
  return Object.fromEntries(members.map((u) => [u, net[u] ?? 0]))
}

/** Stored balances equal the rebuilt ones, sum to zero and are whole numbers; optionally equal `expected`. */
export async function expectBalancesExact(groupId: string, expected?: Record<string, number>) {
  const stored = await balancesOf(groupId)
  expect(stored).toEqual(await rebuiltBalances(groupId))
  expect(Object.values(stored).reduce((a, b) => a + b, 0)).toBe(0)
  expect(Object.values(stored).every(Number.isSafeInteger)).toBe(true)
  if (expected) expect(stored).toEqual(expected)
}
