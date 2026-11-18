import { describe, expect, it } from 'vitest'
import { authErrorMessage, signInFormProblem } from './authErrors'

describe('authErrorMessage', () => {
  it('stays quiet when the person closed the Google window', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull()
  })

  it('does not reveal whether an email has an account on failed log-in', () => {
    const wrongPassword = authErrorMessage({ code: 'auth/wrong-password' })
    const noAccount = authErrorMessage({ code: 'auth/user-not-found' })
    expect(wrongPassword).toBe(noAccount)
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe(noAccount)
  })

  it('says how to fix a duplicate sign-up', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/Log in instead/)
  })

  it('has a fallback for anything unexpected', () => {
    expect(authErrorMessage(new Error('boom'))).toMatch(/Try again/)
    expect(authErrorMessage(undefined)).toMatch(/Try again/)
  })
})

describe('signInFormProblem', () => {
  const ok = { name: 'Ada', email: 'ada@example.com', password: 'longenough' }

  it('accepts a complete form', () => {
    expect(signInFormProblem(ok, 'signup')).toBeNull()
    expect(signInFormProblem({ ...ok, name: '' }, 'login')).toBeNull() // no name on log-in
  })

  it('asks for a name on sign-up only', () => {
    expect(signInFormProblem({ ...ok, name: '  ' }, 'signup')).toMatch(/Add your name/)
  })

  it('checks the email shape and password length', () => {
    expect(signInFormProblem({ ...ok, email: 'ada@example' }, 'login')).toMatch(/email/)
    expect(signInFormProblem({ ...ok, password: 'short' }, 'login')).toMatch(/8 characters/)
  })
})
