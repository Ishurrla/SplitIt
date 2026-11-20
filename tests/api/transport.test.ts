import { afterEach, describe, expect, it } from 'vitest'
import { MAX_BODY_BYTES } from '../../server/http/handle'
import { apiBase, client, expectCode, useEmulators } from './harness'

// The HTTP layer in front of the handlers (server/http/handle.ts): method, body, token and the
// per-person rate limit. The handlers themselves are covered by the other files.
useEmulators()

interface Answer {
  status: number
  headers: Headers
  body: { result?: unknown; error?: { code: string; message: string } }
}

async function raw(name: string, init: RequestInit = {}): Promise<Answer> {
  const response = await fetch(`${apiBase()}/${name}`, init)
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Answer['body'],
  }
}

const post = (name: string, body: string, headers: Record<string, string> = {}) =>
  raw(name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * A real ID token from the Auth emulator for a new account, with some claims changed. The emulator
 * issues unsigned tokens, which firebase-admin accepts only because it is talking to the emulators.
 */
async function emulatorToken(change: Record<string, unknown> = {}): Promise<string> {
  const token = await (await client({ profile: 'Token' })).idToken()
  const [header, payload] = (token ?? '').split('.')
  if (!header || !payload) throw new Error('The Auth emulator did not return a token')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object
  return `${header}.${b64({ ...claims, ...change })}.`
}

const settle = (token?: string) =>
  post(
    'settleUp',
    JSON.stringify({ data: { groupId: 'noSuchGroup' } }),
    token ? { Authorization: `Bearer ${token}` } : {},
  )

describe('requests', () => {
  it('only accepts POST, and sends no CORS headers', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
      const a = await raw('settleUp', { method })
      expect(a.status, method).toBe(405)
      expect(a.headers.get('allow')).toBe('POST')
      expect(a.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('answers not-found for a name that is not an API call', async () => {
    for (const name of ['nope', 'toString', '__proto__', 'constructor']) {
      const a = await post(name, '{"data":{}}')
      expect(a.status, name).toBe(404)
      expect(a.body.error?.code).toBe('not-found')
    }
  })

  it('refuses a body that is not JSON, not { data }, or not sent as JSON', async () => {
    expect((await post('settleUp', 'not json')).body.error?.code).toBe('invalid-argument')
    expect((await post('settleUp', '[1,2]')).body.error?.code).toBe('invalid-argument')
    expect((await post('settleUp', '{"groupId":"x"}')).body.error?.code).toBe('invalid-argument')
    const asText = await raw('settleUp', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"data":{}}',
    })
    expect(asText.status).toBe(400)
    expect(asText.body.error?.code).toBe('invalid-argument')
  })

  it('refuses a body over the size limit with 413, with or without a Content-Length', async () => {
    const big = JSON.stringify({ data: { title: 'x'.repeat(MAX_BODY_BYTES) } })
    const declared = await post('saveExpense', big)
    expect(declared.status).toBe(413)
    expect(declared.body.error?.code).toBe('invalid-argument')

    const bytes = new TextEncoder().encode(big)
    const streamed = await raw('saveExpense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 4096) controller.enqueue(bytes.slice(i, i + 4096))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    expect(streamed.status).toBe(413)
  })
})

describe('ID tokens', () => {
  it('a well-formed token for this project reaches the handler (the control for the tests below)', async () => {
    const a = await settle(await emulatorToken())
    expect(a.status).toBe(403)
    expect(a.body.error?.code).toBe('permission-denied')
  })

  it('no token: the handler answers unauthenticated', async () => {
    const a = await settle()
    expect(a.status).toBe(401)
    expect(a.body.error?.code).toBe('unauthenticated')
  })

  it('refuses a garbage, expired or other-project token, or a header that is not Bearer', async () => {
    const now = Math.floor(Date.now() / 1000)
    const bad = {
      garbage: 'not-a-token',
      expired: await emulatorToken({ exp: now - 60 }),
      otherProject: await emulatorToken({
        aud: 'demo-other',
        iss: 'https://securetoken.google.com/demo-other',
      }),
      noSubject: await emulatorToken({ sub: '', user_id: '' }),
    }
    for (const [label, token] of Object.entries(bad)) {
      const a = await settle(token)
      expect(a.status, label).toBe(401)
      expect(a.body.error?.code, label).toBe('unauthenticated')
    }
    const basic = await post('settleUp', '{"data":{}}', { Authorization: 'Basic abc' })
    expect(basic.body.error?.code).toBe('unauthenticated')
  })
})

describe('rate limit', () => {
  afterEach(() => {
    delete process.env.API_RATE_LIMIT_PER_MINUTE
  })

  it('answers resource-exhausted (429) once one person passes the per-minute limit', async () => {
    process.env.API_RATE_LIMIT_PER_MINUTE = '5'
    const c = await client({ profile: 'Busy' })
    for (let i = 0; i < 5; i++) {
      await expectCode(c.call('settleUp', { groupId: 'noSuchGroup' }), 'permission-denied')
    }
    await expectCode(c.call('settleUp', { groupId: 'noSuchGroup' }), 'resource-exhausted')
    // Someone else is not affected.
    const other = await client({ profile: 'Calm' })
    await expectCode(other.call('settleUp', { groupId: 'noSuchGroup' }), 'permission-denied')
  })
})
