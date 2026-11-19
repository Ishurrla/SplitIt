import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useSignedIn } from '../auth/context'
import { personName } from '../groups/people'
import { activityQuery, membersQuery, useMyGroups } from '../groups/queries'
import type { Group } from '../groups/types'
import { ago } from '../lib/time'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { Tabs } from '../ui/Tabs'
import { describeActivity } from './describe'
import { activityCategory, type ActivityEntry, type ActivityFilter } from './types'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'payments', label: 'Payments' },
  { id: 'groups', label: 'Group activity' },
] as const

const SHOWN = 40

const marker: Record<Exclude<ActivityFilter, 'all'>, string> = {
  expenses: 'before:bg-ink',
  payments: 'before:border-biro before:bg-biro',
  groups: 'before:bg-paper',
}

/**
 * Everything that happened across my groups, newest first. Read from each group's own activity
 * subcollection (the rules check membership group by group), then merged here.
 */
export function ActivityPage() {
  const { user } = useSignedIn()
  const me = user.uid
  const groups = useMyGroups(me)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const list = groups.data ?? []

  const activity = useQueries({ queries: list.map((g) => activityQuery(g.id)) })
  const members = useQueries({ queries: list.map((g) => membersQuery(g.id)) })

  const loading =
    groups.isPending || activity.some((q) => q.isPending) || members.some((q) => q.isPending)
  const failed = groups.isError || activity.some((q) => q.isError) || members.some((q) => q.isError)

  const entries: { entry: ActivityEntry; group: Group; text: string }[] = list.flatMap(
    (group, i) => {
      const people = { me, members: members[i]?.data ?? [], pastMembers: group.pastMembers }
      const nameOf = (uid: string) => personName(uid, people)
      return (activity[i]?.data ?? []).map((entry) => ({
        entry,
        group,
        text: describeActivity(entry, nameOf, group.currency),
      }))
    },
  )
  const shown = entries
    .filter(({ entry }) => filter === 'all' || activityCategory(entry.kind) === filter)
    .sort(
      (a, b) =>
        (b.entry.createdAt?.toMillis() ?? Infinity) - (a.entry.createdAt?.toMillis() ?? Infinity),
    )
    .slice(0, SHOWN)

  function retry() {
    void groups.refetch()
    activity.forEach((q) => void q.refetch())
    members.forEach((q) => void q.refetch())
  }

  return (
    <div>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">Activity</h1>
      <p className="mt-2.5 font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
        Stay updated on what&apos;s happening in your groups.
      </p>

      <Tabs
        label="Filter activity"
        idBase="activity-filter"
        tabs={FILTERS}
        value={filter}
        onChange={setFilter}
        className="mt-5 gap-6 border-b-[1.5px] border-ink"
      />

      <div
        id="activity-filter-panel"
        role="tabpanel"
        aria-labelledby={`activity-filter-tab-${filter}`}
      >
        {failed ? (
          <p className="mt-5 text-red">
            Couldn&apos;t load all of your activity.{' '}
            <Button variant="link" onClick={retry}>
              Try again
            </Button>
          </p>
        ) : null}

        {loading ? (
          <div aria-busy="true" aria-label="Loading activity" className="mt-5 grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse bg-wash" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-[22px] rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
            <h3 className="mb-1.5 text-2xl">Nothing here yet</h3>
            <p className="text-muted">
              Entries show up as soon as someone adds an expense or a payment.
            </p>
          </div>
        ) : (
          <ol className="mt-[18px] border-l-2 border-solid border-ink pl-6">
            {shown.map(({ entry, group, text }) => (
              <li
                key={`${group.id}/${entry.id}`}
                className={`relative flex items-start gap-3 border-b border-rule py-3.5 pl-1 before:absolute before:top-[21px] before:-left-[31px] before:size-3 before:border-2 before:border-solid before:border-ink ${marker[activityCategory(entry.kind)]}`}
              >
                <Avatar
                  seed={entry.actorId}
                  name=""
                  photoPath={
                    members[list.indexOf(group)]?.data?.find((m) => m.uid === entry.actorId)
                      ?.photoPath
                  }
                  photoURL={
                    members[list.indexOf(group)]?.data?.find((m) => m.uid === entry.actorId)
                      ?.photoURL
                  }
                  size="sm"
                  decorative
                />
                <div className="min-w-0 flex-1">
                  <span>{text}</span>
                  <small className="block text-muted">
                    {group.name} · {entry.createdAt ? ago(entry.createdAt.toMillis()) : 'just now'}
                  </small>
                </div>
                <Link to={`/app/groups/${group.id}`} className={buttonClass('link')}>
                  Open
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
