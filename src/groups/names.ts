import type { Member } from './types'

/** "Ada, Femi and you" / "Ada and you" / "Just you so far" (the prototype's group subtitle). */
export function membersSentence(
  members: readonly Pick<Member, 'uid' | 'displayName'>[],
  me: string,
): string {
  const others = members.filter((m) => m.uid !== me).map((m) => m.displayName)
  if (others.length === 0) return 'Just you so far'
  return `${others.join(', ')} and you`
}

/** "1 member" / "3 members". */
export function countLabel(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
