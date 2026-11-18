import { useState, type SyntheticEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { logInWithEmail, signInWithGoogle, signUpWithEmail } from '../auth/actions'
import { authErrorMessage, signInFormProblem } from '../auth/authErrors'
import { useAuth } from '../auth/context'
import { safeNext } from '../lib/safeNext'
import { Brand } from '../ui/Brand'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/toastContext'

type Mode = 'login' | 'signup'
const MODES = [
  { id: 'login', label: 'Log in' },
  { id: 'signup', label: 'Sign up' },
] as const

/**
 * /auth?mode=signup&next=/join/abc
 * After signing in, goes to `next` (only paths inside this app; see safeNext) or the dashboard.
 */
export function AuthPage() {
  const auth = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'login'
  const next = safeNext(params.get('next'))

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (auth.status === 'signedIn') return <Navigate to={next} replace />

  const shownError = error ?? (auth.status === 'signedOut' ? auth.redirectError : null)

  function switchMode(m: Mode) {
    setError(null)
    setParams(
      (p) => {
        if (m === 'signup') p.set('mode', 'signup')
        else p.delete('mode')
        return p
      },
      { replace: true },
    )
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = signInFormProblem({ name, email, password }, mode)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(name, email, password)
        toast('Account created. Welcome to SplitIt.')
      } else {
        await logInWithEmail(email, password)
        toast('Welcome back.')
      }
      // The auth state change re-renders this page, which then navigates to `next`.
    } catch (e) {
      setError(authErrorMessage(e))
      setBusy(false)
    }
  }

  async function onGoogle() {
    setError(null)
    setBusy(true)
    try {
      if ((await signInWithGoogle()) === 'done') toast('Signed in with Google.')
    } catch (e) {
      setError(authErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <main className="pt-14 pb-10 max-[860px]:pt-[26px]">
      <div className="mx-auto grid max-w-[1040px] grid-cols-[1.15fr_1fr] items-start gap-16 px-[22px] max-[860px]:grid-cols-1 max-[860px]:gap-[34px] max-[860px]:px-[18px]">
        <section>
          <Link
            to="/"
            className="mb-[26px] inline-block font-semibold text-biro underline underline-offset-3"
          >
            ← Back
          </Link>
          <Brand className="mb-[26px] block text-[2rem]" />
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.04] font-normal">
            Who paid for what, and <span className="highlighter">who owes whom.</span>
          </h1>
          <p className="mt-[18px] max-w-[42ch] text-[1.05rem] text-muted">
            Keep a running tab with friends, flatmates and travel mates. SplitIt works out the
            fewest payments to clear it.
          </p>
        </section>

        <section className="rounded-pen border-pen bg-sheet px-[30px] pt-[30px] pb-[34px] shadow-offset">
          <h2 className="text-[1.9rem]">{mode === 'login' ? 'Welcome back' : 'Open an account'}</h2>
          <Tabs
            label="Sign in mode"
            idBase="auth-mode"
            tabs={MODES}
            value={mode}
            onChange={switchMode}
            className="mt-4 mb-1"
          />
          <form
            id="auth-mode-panel"
            role="tabpanel"
            aria-labelledby={`auth-mode-tab-${mode}`}
            noValidate
            onSubmit={(e) => void onSubmit(e)}
          >
            {mode === 'signup' ? (
              <Field
                label="Your name"
                autoComplete="name"
                maxLength={60}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
              />
            ) : null}
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
            <Field
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
            />
            <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
              {shownError}
            </p>
            <Button type="submit" variant="primary" block disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
          <p className="mt-5 flex items-center gap-3 text-[.85rem] text-muted before:flex-1 before:border-t before:border-rule after:flex-1 after:border-t after:border-rule">
            or
          </p>
          <Button block className="mt-3.5" disabled={busy} onClick={() => void onGoogle()}>
            Continue with Google
          </Button>
        </section>
      </div>
    </main>
  )
}
