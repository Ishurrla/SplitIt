import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useSignedIn } from '../auth/context'
import { Avatar } from '../ui/Avatar'
import { Brand } from '../ui/Brand'
import { Icon, type IconName } from '../ui/Icon'
import { ThemeButton } from '../ui/ThemeButton'
import { LogOutButton } from './LogOutButton'
import { SearchDialog } from './SearchDialog'

const NAV: readonly { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', label: 'Dashboard', icon: 'dash', end: true },
  { to: '/app/groups', label: 'Groups', icon: 'groups' },
  { to: '/app/activity', label: 'Activity', icon: 'activity' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
]

// Narrow layout is decided by the width of the app (a container query on "shell"), not the
// window, as in the prototype. Below 860px: no sidebar, a tab bar at the bottom.
const NARROW_HIDE = '@max-[860px]/shell:hidden'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function AppShell() {
  const { user, profile } = useSignedIn()
  const [searchOpen, setSearchOpen] = useState(false)
  const name = profile?.displayName ?? user.displayName ?? 'You'

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className="@container/shell flex min-h-screen flex-col">
      <div className="grid flex-1 grid-cols-[232px_minmax(0,1fr)] @max-[860px]/shell:grid-cols-1">
        <aside
          className={`sticky top-0 flex h-screen flex-col gap-1 self-start border-r-[1.5px] border-solid border-ink px-3.5 py-[22px] ${NARROW_HIDE}`}
        >
          <Brand to="/app" className="mx-2.5 mb-[22px]" />
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className="flex items-center gap-3 border-l-[3px] border-solid border-transparent px-3 py-2.5 font-semibold text-muted hover:bg-wash hover:text-ink aria-[current=page]:border-biro aria-[current=page]:bg-wash aria-[current=page]:text-ink"
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-rule px-2.5 pt-3.5 pb-1">
            <Avatar seed={user.uid} name={name} photoUrl={profile?.photoURL} />
            <span className="min-w-0">
              <b className="block truncate">{name}</b>
              <LogOutButton variant="link" className="text-[.85rem]" />
            </span>
          </div>
        </aside>

        <div className="min-w-0 px-[30px] pb-[60px] @max-[860px]/shell:px-[18px] @max-[860px]/shell:pb-[30px]">
          <header className="sticky top-0 z-15 flex items-center gap-3.5 border-b border-rule bg-paper py-3.5">
            <Brand to="/app" className="hidden text-[1.4rem] @max-[860px]/shell:inline" />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(true)
              }}
              aria-label="Search groups and expenses"
              className="flex max-w-[520px] flex-1 items-center gap-2.5 rounded-pen border-[1.5px] border-solid border-ink bg-sheet px-3 py-[9px] text-left text-muted @max-[860px]/shell:ml-auto @max-[860px]/shell:max-w-none @max-[860px]/shell:flex-none @max-[860px]/shell:p-[9px]"
            >
              <Icon name="search" className="size-[18px]" />
              <span className={NARROW_HIDE}>Search groups, expenses…</span>
              <kbd
                className={`ml-auto rounded-tick border border-solid border-muted px-1.5 font-mono text-[.75rem] ${NARROW_HIDE}`}
              >
                {isMac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
            <ThemeButton labelClassName={NARROW_HIDE} />
          </header>
          <main className="pt-[26px]">
            <Outlet />
          </main>
        </div>
      </div>

      <nav
        aria-label="Main"
        className="sticky bottom-0 z-25 hidden grid-cols-4 border-t-[1.5px] border-solid border-ink bg-sheet @max-[860px]/shell:grid"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className="flex flex-col items-center justify-center gap-0.5 border-t-[3px] border-solid border-transparent px-1 pt-[9px] pb-2 text-center text-[.72rem] font-semibold text-muted aria-[current=page]:border-biro aria-[current=page]:text-biro"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {searchOpen ? (
        <SearchDialog
          onClose={() => {
            setSearchOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
