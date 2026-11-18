import type { Group, Member } from './types'

export interface People {
  me: string
  members: readonly Pick<Member, 'uid' | 'displayName' | 'photoURL'>[]
  pastMembers: Group['pastMembers']
}

/**
 * The name to show for anyone an expense mentions: "You", a member's name, "Bayo (left)" for
 * someone who left (from the group's pastMembers), or "Someone" if we have no record at all.
 */
export function personName(uid: string, people: People): string {
  if (uid === people.me) return 'You'
  const member = people.members.find((m) => m.uid === uid)
  if (member) return member.displayName
  const past = people.pastMembers[uid]
  if (past) return `${past.displayName} (left)`
  return 'Someone'
}
