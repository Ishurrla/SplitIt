import { afterEach, describe, expect, it, vi } from 'vitest'
import { postApi } from './apiClient'
import { callableErrorMessage, isConnectionError } from './callables'

vi.mock('./firebase', () => ({ auth: { currentUser: null } }))

function answer(status: number, body: unknown, json = true) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(json ? JSON.stringify(body) : String(body), {
        status,
        headers: { 'Content-Type': json ? 'application/json' : 'text/html' },
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postApi', () => {
  it('sends { data } as JSON with the ID token, and returns the result', async () => {
    const fetch = answer(200, { result: { groupId: 'g1' } })
    vi.stubGlobal('fetch', fetch)
    await expect(postApi('/api/createGroup', { name: 'Trip' }, 'tok')).resolves.toEqual({
      groupId: 'g1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/createGroup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: '{"data":{"name":"Trip"}}',
    })
  })

  it('sends no Authorization header when signed out', async () => {
    const fetch = answer(200, { result: null })
    vi.stubGlobal('fetch', fetch)
    await postApi('/api/x', {}, null)
    expect(fetch).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('turns the server error into the callable code and keeps its message', async () => {
    vi.stubGlobal(
      'fetch',
      answer(403, { error: { code: 'permission-denied', message: "You're not in this group." } }),
    )
    const error: unknown = await postApi('/api/settleUp', {}, 't').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'functions/permission-denied' })
    expect(callableErrorMessage(error)).toBe("You're not in this group.")
    expect(isConnectionError(error)).toBe(false)
  })

  it('no connection: unavailable, shown as a connection problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const error: unknown = await postApi('/api/x', {}, 't').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'functions/unavailable' })
    expect(isConnectionError(error)).toBe(true)
    expect(callableErrorMessage(error)).toMatch(/Couldn't reach the server/)
  })

  it('an answer that is not the API (a platform error page): internal, a connection problem', async () => {
    vi.stubGlobal('fetch', answer(504, '<html>Gateway Timeout</html>', false))
    const error: unknown = await postApi('/api/x', {}, 't').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'functions/internal' })
    expect(isConnectionError(error)).toBe(true)
  })

  it('an unknown error code becomes internal', async () => {
    vi.stubGlobal('fetch', answer(400, { error: { code: 'made-up', message: 'x' } }))
    await expect(postApi('/api/x', {}, 't')).rejects.toMatchObject({ code: 'functions/internal' })
  })
})
