import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSignedIn } from '../auth/context'
import { GroupPicker } from '../dashboard/GroupPicker'
import { SpendingChart } from '../dashboard/SpendingChart'
import { Tiles } from '../dashboard/Tiles'
import { totalsByCurrency } from '../dashboard/totals'
import { GroupCard, GroupCardSkeletons, cardsGridClass } from '../groups/GroupCard'
import { NewGroupModal } from '../groups/NewGroupModal'
import { useMyGroups } from '../groups/queries'
import type { Group } from '../groups/types'
import { callableErrorMessage, spendingByMonth } from '../lib/callables'
import { isCurrencyCode, type CurrencyCode } from '../lib/money'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonStyles'
import { Icon, type IconName } from '../ui/Icon'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/toastContext'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const secHead =
  'mt-[38px] flex items-baseline justify-between gap-3 border-b-[1.5px] border-solid border-ink pb-2'

type Picking = { kind: 'expense' } | { kind: 'invite' } | null

export function DashboardPage() {
  const { user, profile } = useSignedIn()
  const me = user.uid
  const navigate = useNavigate()
  const toast = useToast()
  const groups = useMyGroups(me)
  const [creating, setCreating] = useState(false)
  const [picking, setPicking] = useState<Picking>(null)
  const [chartCurrency, setChartCurrency] = useState<CurrencyCode | null>(null)
  const firstName = profile?.displayName.split(' ')[0] ?? ''
  const defaultCurrency = profile?.defaultCurrency ?? 'NGN'

  // My share per month, from the spendingByMonth function (real expenses, my share only).
  const spending = useQuery({
    queryKey: ['spending', me],
    queryFn: () =>
      spendingByMonth({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, months: 6 }),
  })

  const list = groups.data ?? []
  const totals = totalsByCurrency(list, me, defaultCurrency)
  const chartCodes = (spending.data ? Object.keys(spending.data.byCurrency) : [])
    .filter(isCurrencyCode)
    .sort((a, b) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : a.localeCompare(b)))
  const shown = chartCurrency && chartCodes.includes(chartCurrency) ? chartCurrency : chartCodes[0]

  function needGroups(): boolean {
    if (list.length > 0) return true
    toast('Start a group first. Then you can add expenses and invite people.')
    return false
  }

  function settleUp() {
    const owing = list.find((g) => (g.balances[me] ?? 0) < 0)
    const owed = list.find((g) => (g.balances[me] ?? 0) > 0)
    const target = owing ?? owed
    if (!target) {
      toast('Everything is settled. Nothing to clear.')
      return
    }
    void navigate(`/app/groups/${target.id}/settle`)
  }

  function pick(group: Group) {
    const kind = picking?.kind ?? 'expense'
    setPicking(null)
    void navigate(`/app/groups/${group.id}?add=${kind}`)
  }

  return (
    <div>
      <p className="text-[.9rem] text-muted">{greeting(new Date().getHours())}</p>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">
        {firstName}, here is where you stand.
      </h1>

      {groups.isPending ? (
        <div
          aria-busy="true"
          aria-label="Loading balances"
          className="mt-6 h-28 animate-pulse bg-wash"
        />
      ) : groups.isError ? (
        <p className="mt-6 text-red">
          Couldn&apos;t load your balances.{' '}
          <Button variant="link" onClick={() => void groups.refetch()}>
            Try again
          </Button>
        </p>
      ) : totals.length === 0 ? null : (
        <>
          <Tiles totals={totals} groupCount={list.length} />
          <p className="mt-2 text-[.88rem] text-muted">
            Balances are kept per currency. SplitIt does not convert between them.
          </p>
        </>
      )}

      <div className="grid grid-cols-[1.6fr_1fr] gap-[38px] @max-[860px]/shell:grid-cols-1 @max-[860px]/shell:gap-1.5">
        <section>
          <div className={secHead}>
            <h2 className="text-2xl">Your spending</h2>
            <span className="text-[.9rem] text-muted">Your share, by month</span>
          </div>
          {spending.isPending ? (
            <div
              aria-busy="true"
              aria-label="Loading your spending"
              className="mt-3.5 h-48 animate-pulse bg-wash"
            />
          ) : spending.isError ? (
            <p className="mt-4 text-red">
              {callableErrorMessage(spending.error)}{' '}
              <Button variant="link" onClick={() => void spending.refetch()}>
                Try again
              </Button>
            </p>
          ) : !shown ? (
            <p className="mt-4 text-muted">Your spending shows here once you are in a group.</p>
          ) : (
            <>
              {chartCodes.length > 1 ? (
                <Tabs
                  label="Chart currency"
                  idBase="chart-currency"
                  tabs={chartCodes.map((c) => ({ id: c, label: c }))}
                  value={shown}
                  onChange={setChartCurrency}
                  className="mt-3 border-b-0 font-mono text-[.9rem]"
                />
              ) : null}
              <div id="chart-currency-panel" role={chartCodes.length > 1 ? 'tabpanel' : undefined}>
                <SpendingChart
                  months={spending.data.months}
                  values={spending.data.byCurrency[shown] ?? []}
                  currency={shown}
                />
              </div>
            </>
          )}
        </section>

        <section>
          <div className={secHead}>
            <h2 className="text-2xl">Quick actions</h2>
          </div>
          <div className="mt-1">
            <QuickAction
              icon="plus"
              label="Add expense"
              onClick={() => {
                if (needGroups()) setPicking({ kind: 'expense' })
              }}
            />
            <QuickAction
              icon="groups"
              label="Create group"
              onClick={() => {
                setCreating(true)
              }}
            />
            <QuickAction
              icon="invite"
              label="Invite members"
              onClick={() => {
                if (needGroups()) setPicking({ kind: 'invite' })
              }}
            />
            <QuickAction icon="tick" label="Settle up" onClick={settleUp} />
          </div>
        </section>
      </div>

      <div className={secHead}>
        <h2 className="text-2xl">Your groups</h2>
        <Link to="/app/groups" className={buttonClass('link')}>
          View all
        </Link>
      </div>
      {groups.data?.length === 0 ? (
        <div className="mt-[18px] rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
          <h3 className="mb-1.5 text-2xl">No groups yet</h3>
          <p className="mb-4 text-muted">Start one, then invite the people you share costs with.</p>
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true)
            }}
          >
            Create group
          </Button>
        </div>
      ) : (
        <div className={cardsGridClass}>
          {groups.isPending ? (
            <GroupCardSkeletons />
          ) : (
            list.slice(0, 3).map((g) => <GroupCard key={g.id} group={g} me={me} />)
          )}
        </div>
      )}

      {creating ? (
        <NewGroupModal
          onClose={() => {
            setCreating(false)
          }}
        />
      ) : null}
      {picking ? (
        <GroupPicker
          title={picking.kind === 'expense' ? 'Add an expense' : 'Invite members'}
          groups={list}
          onPick={pick}
          onClose={() => {
            setPicking(null)
          }}
        />
      ) : null}
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: IconName
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-rule px-1 py-3.5 text-left font-semibold hover:bg-sheet"
    >
      <Icon name={icon} className="size-5 text-biro" />
      {label}
      <span className="ml-auto text-muted">
        <Icon name="go" className="size-5" />
      </span>
    </button>
  )
}
