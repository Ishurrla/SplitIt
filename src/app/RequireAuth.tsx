import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { logOut } from '../auth/actions'
import { useAuth } from '../auth/context'
import { authUrlFor } from '../lib/safeNext'
import { Button } from '../ui/Button'

/**
 * Guards /app/* and /join/*. Signed-out visitors go to /auth with ?next= set to where they were
 * heading, so they come straight back after signing in (an invite link survives the detour).
 * Children render only once users/{uid} exists, so every screen can rely on the profile.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return <FullPageMessage title="Loading…" />
  if (auth.status === 'signedOut') {
    return <Navigate to={authUrlFor(location.pathname + location.search)} replace />
  }
  if (auth.profileError) {
    return (
      <FullPageMessage title="Something went wrong" text={auth.profileError}>
        <Button
          variant="primary"
          onClick={() => {
            window.location.reload()
          }}
        >
          Try again
        </Button>
        <Button
          className="ml-2.5"
          onClick={() => {
            void logOut()
          }}
        >
          Log out
        </Button>
      </FullPageMessage>
    )
  }
  if (!auth.profile) return <FullPageMessage title="Setting up your account…" />
  return children
}

function FullPageMessage({
  title,
  text,
  children,
}: {
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <main
      className="grid min-h-screen place-items-center p-6"
      aria-busy={children ? undefined : true}
    >
      <div className="text-center">
        <h1 className="text-3xl">{title}</h1>
        {text ? <p className="mt-2 text-muted">{text}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </main>
  )
}
