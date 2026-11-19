import { personName, type People } from '../groups/people'
import type { Group } from '../groups/types'
import { ago } from '../lib/time'
import { describeActivity } from './describe'
import type { ActivityEntry } from './types'

/** The group page's "Recent" list: the last few things that happened, newest first. */
export function RecentActivity({
  group,
  entries,
  people,
}: {
  group: Group
  entries: readonly ActivityEntry[]
  people: People
}) {
  const nameOf = (uid: string) => personName(uid, people)
  return (
    <section>
      <h3 className="flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1.5 text-[1.3rem]">
        Recent
      </h3>
      {entries.length === 0 ? (
        <p className="py-3 text-[.92rem] text-muted">Nothing yet.</p>
      ) : (
        <ul className="text-[.92rem]">
          {entries.slice(0, 5).map((a) => (
            <li key={a.id} className="border-b border-rule py-[9px]">
              {describeActivity(a, nameOf, group.currency)}
              <small className="block text-muted">
                {a.createdAt ? ago(a.createdAt.toMillis()) : 'just now'}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
