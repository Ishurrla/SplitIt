import { useQuery, type QueryClient } from '@tanstack/react-query'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { db } from '../lib/firebase'
import { storage } from '../lib/firebaseServices'
import type { ActivityEntry } from '../activity/types'
import type { Expense } from '../expenses/types'
import { settleUp } from '../lib/callables'
import type { Payment } from '../payments/types'
import type { Group, Member } from './types'

export const keys = {
  myGroups: (uid: string) => ['groups', uid] as const,
  members: (groupId: string) => ['members', groupId] as const,
  invites: (groupId: string) => ['invites', groupId] as const,
  storageUrl: (path: string) => ['storageUrl', path] as const,
  expenses: (groupId: string) => ['expenses', groupId] as const,
  payments: (groupId: string) => ['payments', groupId] as const,
  settle: (groupId: string) => ['settle', groupId] as const,
  activity: (groupId: string) => ['activity', groupId] as const,
}

/**
 * How the per-group lists are filled. 'live': only by the onSnapshot listeners of an open group
 * (see live/groupLive.ts), so nothing is read twice. 'fetch': a one-off read, for screens that
 * look across groups (search, the Activity page) without keeping every group live.
 */
export type Source = 'live' | 'fetch'

/** Newest first, at most max, for one of a group's subcollections. */
async function latest<T>(groupId: string, name: string, max: number): Promise<T[]> {
  const snap = await getDocs(
    query(collection(db, 'groups', groupId, name), orderBy('createdAt', 'desc'), limit(max)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
}

/** Groups I'm in, newest first. The query matches the rule on groups (memberIds contains me). */
export function useMyGroups(uid: string) {
  return useQuery({
    queryKey: keys.myGroups(uid),
    queryFn: async (): Promise<Group[]> => {
      const snap = await getDocs(
        query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)),
      )
      const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Group, 'id'>) }))
      // Sorted here rather than with orderBy, which would need a composite index for a few rows.
      return groups.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    },
  })
}

/** A group's members, in the order they joined (the owner first). */
export function membersQuery(groupId: string) {
  return {
    queryKey: keys.members(groupId),
    queryFn: async (): Promise<Member[]> => {
      const snap = await getDocs(
        query(collection(db, 'groups', groupId, 'members'), orderBy('joinedAt')),
      )
      return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) }))
    },
  }
}

export function useMembers(groupId: string) {
  return useQuery(membersQuery(groupId))
}

export interface PendingInvite {
  token: string
  email: string | null
  expiresAt: Timestamp
}

/** Invites still waiting to be used. The rules let only the owner read these. */
export function usePendingInvites(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invites(groupId),
    enabled,
    queryFn: async (): Promise<PendingInvite[]> => {
      const snap = await getDocs(query(collection(db, 'invites'), where('groupId', '==', groupId)))
      const now = Date.now()
      return snap.docs
        .map((d) => {
          const data = d.data() as {
            email: string | null
            acceptedAt: Timestamp | null
            expiresAt: Timestamp
          }
          return {
            token: d.id,
            email: data.email,
            acceptedAt: data.acceptedAt,
            expiresAt: data.expiresAt,
          }
        })
        .filter((i) => i.expiresAt.toMillis() > now && i.acceptedAt === null)
        .map(({ token, email, expiresAt }) => ({ token, email, expiresAt }))
        .sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis())
    },
  })
}

/** A download URL for a Storage path the rules let me read (covers now; receipts and avatars later). */
export function useStorageUrl(path: string | null) {
  return useQuery({
    queryKey: keys.storageUrl(path ?? ''),
    enabled: path !== null,
    staleTime: Number.POSITIVE_INFINITY, // a path never changes content: new uploads get new names
    queryFn: () => getDownloadURL(ref(storage, path ?? '')),
  })
}

/** A group's expenses, newest first. Members only (firestore.rules). */
export function useExpenses(groupId: string, source: Source) {
  return useQuery({
    queryKey: keys.expenses(groupId),
    queryFn: () => latest<Expense>(groupId, 'expenses', 500),
    enabled: source === 'fetch',
  })
}

/** A group's payments, newest first. Members only. */
export function usePayments(groupId: string, source: Source) {
  return useQuery({
    queryKey: keys.payments(groupId),
    queryFn: () => latest<Payment>(groupId, 'payments', 500),
    enabled: source === 'fetch',
  })
}

/** A group's latest activity entries, newest first. Members only. */
export function activityQuery(groupId: string) {
  return {
    queryKey: keys.activity(groupId),
    queryFn: () => latest<ActivityEntry>(groupId, 'activity', 50),
  }
}

export function useActivity(groupId: string, source: Source) {
  return useQuery({ ...activityQuery(groupId), enabled: source === 'fetch' })
}

/** For search: the same expenses query, fetched once for a group that isn't open. */
export function expensesQuery(groupId: string) {
  return {
    queryKey: keys.expenses(groupId),
    queryFn: () => latest<Expense>(groupId, 'expenses', 500),
  }
}

/** The settle-up plan, worked out by the settleUp function. The browser never computes it. */
export function useSettlePlan(groupId: string) {
  return useQuery({ queryKey: keys.settle(groupId), queryFn: () => settleUp({ groupId }) })
}

/** After any change to a group: refetch the group, its members, and my group list. */
export async function refreshGroup(client: QueryClient, groupId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['group', groupId] }),
    client.invalidateQueries({ queryKey: keys.members(groupId) }),
    client.invalidateQueries({ queryKey: keys.invites(groupId) }),
    client.invalidateQueries({ queryKey: keys.expenses(groupId) }),
    client.invalidateQueries({ queryKey: keys.payments(groupId) }),
    client.invalidateQueries({ queryKey: keys.settle(groupId) }),
    client.invalidateQueries({ queryKey: ['groups'] }),
  ])
}
