import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from 'firebase/firestore'
import { useEffect } from 'react'
import { describeActivity } from '../activity/describe'
import type { ActivityEntry } from '../activity/types'
import { useSignedIn } from '../auth/context'
import { NoAccessError, firestoreCode } from '../groups/noAccess'
import { personName } from '../groups/people'
import { keys } from '../groups/queries'
import type { Group, Member } from '../groups/types'
import { groupKey } from '../groups/useGroup'
import { db } from '../lib/firebase'
import { useToast } from '../ui/toastContext'
import { activeKeys, retain } from './registry'

// Live data for one open group: the group document, its expenses, payments and activity, each an
// onSnapshot listener feeding the same TanStack Query cache entries the screens read.
// Started by <GroupGate> through useGroupLive(); shared and reference-counted by the registry, so
// navigating or React's double mount never leaves a duplicate behind.

export const EXPENSE_LIMIT = 500
export const PAYMENT_LIMIT = 500
export const ACTIVITY_LIMIT = 50
const FRESH_MS = 3_000

export const freshKey = (groupId: string) => ['fresh', groupId] as const

/** Groups the viewer is leaving on purpose: their permission-denied is expected, not news. */
const leaving = new Set<string>()
export function expectLeaving(groupId: string, on: boolean) {
  if (on) leaving.add(groupId)
  else leaving.delete(groupId)
}

/** onSnapshot listeners open right now, for the dev console check after navigating. */
let openListeners = 0

function rows<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
}

/**
 * Puts the group's query into the "no access" state the gate already shows as
 * "You're not in this group". `whileViewing` changes the wording: access ended just now.
 */
function markNoAccess(client: QueryClient, groupId: string, code: string) {
  if (leaving.has(groupId)) return
  const q = client.getQueryCache().find({ queryKey: groupKey(groupId), exact: true })
  if (!q) return
  // All four listeners are refused at once. The first one decides; the later ones would otherwise
  // see the data already cleared and wrongly report "never had access".
  if (q.state.error instanceof NoAccessError) return
  q.setState({
    ...q.state,
    data: undefined,
    status: 'error',
    fetchStatus: 'idle',
    error: new NoAccessError(code, q.state.data !== undefined),
    errorUpdatedAt: Date.now(),
  })
}

export function startGroupListeners(
  client: QueryClient,
  groupId: string,
  me: string,
  notify: (message: string) => void,
): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const groupRef = doc(db, 'groups', groupId)
  const sub = (collectionName: string, max: number) =>
    query(collection(groupRef, collectionName), orderBy('createdAt', 'desc'), limit(max))

  /** Rows added after the first snapshot get the highlighter for a few seconds. */
  function markFresh(ids: string[]) {
    if (ids.length === 0) return
    client.setQueryData<ReadonlySet<string>>(
      freshKey(groupId),
      (old) => new Set([...(old ?? []), ...ids]),
    )
    const t = setTimeout(() => {
      timers.delete(t)
      client.setQueryData<ReadonlySet<string>>(freshKey(groupId), (old) => {
        const next = new Set(old)
        ids.forEach((id) => next.delete(id))
        return next
      })
    }, FRESH_MS)
    timers.add(t)
  }

  function onListError(error: unknown) {
    if (firestoreCode(error) === 'permission-denied')
      markNoAccess(client, groupId, 'permission-denied')
  }

  const stops: (() => void)[] = []
  const listen = (stop: () => void) => {
    openListeners += 1
    stops.push(() => {
      openListeners -= 1
      stop()
    })
  }

  // The group: balances, members list, name and cover.
  listen(
    onSnapshot(
      groupRef,
      (snap) => {
        if (!snap.exists()) {
          markNoAccess(client, groupId, 'not-found')
          return
        }
        const before = client.getQueryData<Group>(groupKey(groupId))
        const group = { id: snap.id, ...snap.data() } as Group
        client.setQueryData(groupKey(groupId), group)
        if (before && before.memberIds.join() !== group.memberIds.join()) {
          void client.invalidateQueries({ queryKey: keys.members(groupId) })
          void client.invalidateQueries({ queryKey: ['groups'] })
        }
        if (before && JSON.stringify(before.balances) !== JSON.stringify(group.balances)) {
          // The plan is worked out by the settleUp function, so ask it again.
          void client.invalidateQueries({ queryKey: keys.settle(groupId) })
        }
      },
      onListError,
    ),
  )

  for (const [name, max, key] of [
    ['expenses', EXPENSE_LIMIT, keys.expenses(groupId)],
    ['payments', PAYMENT_LIMIT, keys.payments(groupId)],
  ] as const) {
    let first = true
    listen(
      onSnapshot(
        sub(name, max),
        (snap) => {
          client.setQueryData(key, rows(snap))
          if (!first)
            markFresh(
              snap
                .docChanges()
                .filter((c) => c.type === 'added')
                .map((c) => c.doc.id),
            )
          first = false
        },
        onListError,
      ),
    )
  }

  // Activity: also the source of the "Ada added Suya" notes about other people's changes.
  let firstActivity = true
  listen(
    onSnapshot(
      sub('activity', ACTIVITY_LIMIT),
      (snap) => {
        client.setQueryData(keys.activity(groupId), rows<ActivityEntry>(snap))
        if (!firstActivity) {
          const group = client.getQueryData<Group>(groupKey(groupId))
          const members = client.getQueryData<Member[]>(keys.members(groupId)) ?? []
          for (const change of snap.docChanges()) {
            if (change.type !== 'added') continue
            const entry = { id: change.doc.id, ...change.doc.data() } as ActivityEntry
            if (entry.actorId === me || !group) continue
            const nameOf = (uid: string) =>
              personName(uid, { me, members, pastMembers: group.pastMembers })
            notify(`${describeActivity(entry, nameOf, group.currency)}.`)
          }
        }
        firstActivity = false
      },
      onListError,
    ),
  )

  return () => {
    stops.splice(0).forEach((stop) => {
      stop()
    })
    timers.forEach(clearTimeout)
    timers.clear()
  }
}

/** Keeps a group's listeners running while the calling screen is mounted. */
export function useGroupLive(groupId: string) {
  const client = useQueryClient()
  const toast = useToast()
  const { user } = useSignedIn()
  const me = user.uid
  useEffect(
    () => retain(`group:${groupId}`, () => startGroupListeners(client, groupId, me, toast)),
    [client, groupId, me, toast],
  )
}

const noneFresh: ReadonlySet<string> = new Set()

/** Ids of rows that arrived in the last few seconds, for the highlighter. */
export function useFreshIds(groupId: string): ReadonlySet<string> {
  const q = useQuery({
    queryKey: freshKey(groupId),
    queryFn: () => noneFresh,
    initialData: noneFresh,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return q.data
}

declare global {
  interface Window {
    /** Dev only: which groups are live and how many onSnapshot listeners are open. */
    __splitit?: { liveGroups: () => string[]; openListeners: () => number }
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__splitit = { liveGroups: activeKeys, openListeners: () => openListeners }
}
