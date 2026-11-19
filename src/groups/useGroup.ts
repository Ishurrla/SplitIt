import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { NoAccessError, firestoreCode } from './noAccess'
import type { Group } from './types'

export const groupKey = (groupId: string) => ['group', groupId] as const

async function fetchGroup(groupId: string): Promise<Group> {
  try {
    const snap = await getDoc(doc(db, 'groups', groupId))
    if (!snap.exists()) throw new NoAccessError('not-found')
    return { id: snap.id, ...(snap.data() as Omit<Group, 'id'>) }
  } catch (error) {
    if (error instanceof NoAccessError) throw error
    if (firestoreCode(error) === 'permission-denied') throw new NoAccessError('permission-denied')
    throw error
  }
}

/**
 * One group. Fails with NoAccessError for groups you are not in (or that don't exist).
 * On an open group the data comes from its listener (live/groupLive.ts), which also sets the
 * NoAccessError if access ends; the one-off read here only runs when the person presses retry.
 */
export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKey(groupId),
    queryFn: () => fetchGroup(groupId),
    enabled: false,
  })
}
