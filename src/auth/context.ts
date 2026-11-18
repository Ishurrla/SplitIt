import type { User } from 'firebase/auth'
import { createContext, useContext } from 'react'
import type { UserProfile } from './profile'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; redirectError: string | null }
  | {
      status: 'signedIn'
      user: User
      /** null until users/{uid} has loaded (or while it is being created on first sign-in). */
      profile: UserProfile | null
      /** Set when the profile could not be created or read. */
      profileError: string | null
    }

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>')
  return state
}

/** For screens that only render behind <RequireAuth>. */
export function useSignedIn(): Extract<AuthState, { status: 'signedIn' }> {
  const state = useAuth()
  if (state.status !== 'signedIn') throw new Error('useSignedIn used outside <RequireAuth>')
  return state
}
