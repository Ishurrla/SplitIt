// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthState } from '../auth/context'
import type { UserProfile } from '../auth/profile'
import { RequireAuth } from './RequireAuth'

afterEach(cleanup)

const user = { uid: 'u1', displayName: 'Dami' } as User
const profile: UserProfile = {
  displayName: 'Dami Ade',
  email: 'dami@example.com',
  photoURL: null,
  photoPath: null,
  defaultCurrency: 'NGN',
  weeklyReminders: true,
  createdAt: null,
}

/** Shows where the router ended up, so a redirect can be checked. */
function WhereAmI() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderGuard(state: AuthState, path = '/join/tok123?from=mail') {
  return render(
    <AuthContext value={state}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={<WhereAmI />} />
          <Route
            path="*"
            element={
              <RequireAuth>
                <p>Secret page</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  )
}

describe('<RequireAuth>', () => {
  it('shows a loading screen, not the page, while sign-in is being checked', () => {
    renderGuard({ status: 'loading' })
    expect(screen.getByRole('heading', { name: 'Loading…' })).toBeTruthy()
    expect(screen.queryByText('Secret page')).toBeNull()
  })

  it('sends a signed-out visitor to /auth with the page they wanted as ?next=', () => {
    renderGuard({ status: 'signedOut', redirectError: null })
    const next = new URLSearchParams(screen.getByTestId('location').textContent.split('?')[1])
    expect(screen.getByTestId('location').textContent).toMatch(/^\/auth\?/)
    expect(next.get('next')).toBe('/join/tok123?from=mail')
    expect(screen.queryByText('Secret page')).toBeNull()
  })

  it('waits for the profile document before showing the page', () => {
    renderGuard({ status: 'signedIn', user, profile: null, profileError: null })
    expect(screen.getByRole('heading', { name: 'Setting up your account…' })).toBeTruthy()
    expect(screen.queryByText('Secret page')).toBeNull()
  })

  it('shows the profile error with a way to retry', () => {
    renderGuard({
      status: 'signedIn',
      user,
      profile: null,
      profileError: "Couldn't load your profile.",
    })
    expect(screen.getByText("Couldn't load your profile.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Secret page')).toBeNull()
  })

  it('shows the page once signed in with a profile', () => {
    renderGuard({ status: 'signedIn', user, profile, profileError: null })
    expect(screen.getByText('Secret page')).toBeTruthy()
  })
})
