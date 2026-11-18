import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase'
import { authErrorMessage } from './authErrors'
import { AuthContext, type AuthState } from './context'
import { ensureUserProfile, type UserProfile } from './profile'

/**
 * Knows who is signed in, makes sure their users/{uid} document exists, and keeps that
 * document live (so a name change shows everywhere at once).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let redirectError: string | null = null
    // Surfaces errors from a Google redirect sign-in (the user itself arrives via onAuthStateChanged).
    getRedirectResult(auth).catch((error: unknown) => {
      redirectError = authErrorMessage(error)
      setState((s) => (s.status === 'signedOut' ? { ...s, redirectError } : s))
    })

    let stopProfile: (() => void) | undefined
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.()
      stopProfile = undefined
      if (!user) {
        setState({ status: 'signedOut', redirectError })
        return
      }
      setState({ status: 'signedIn', user, profile: null, profileError: null })
      let cancelled = false
      stopProfile = () => {
        cancelled = true
      }
      ensureUserProfile(user)
        .then(() => {
          if (cancelled) return
          stopProfile = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
              setState({
                status: 'signedIn',
                user,
                profile: snap.exists() ? (snap.data() as UserProfile) : null,
                profileError: null,
              })
            },
            () => {
              setState({
                status: 'signedIn',
                user,
                profile: null,
                profileError: "Couldn't load your profile. Refresh the page to try again.",
              })
            },
          )
        })
        .catch(() => {
          if (cancelled) return
          setState({
            status: 'signedIn',
            user,
            profile: null,
            profileError:
              "Couldn't set up your profile. Check your connection and refresh the page.",
          })
        })
    })

    return () => {
      stopAuth()
      stopProfile?.()
    }
  }, [])

  return <AuthContext value={state}>{children}</AuthContext>
}
