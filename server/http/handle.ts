import { getAuth } from 'firebase-admin/auth'
import { adminApp } from '../admin.js'
import { handlers } from '../handlers/index.js'
import { ApiError, ERROR_STATUS, type ErrorCode } from '../lib/errors.js'
import { logger } from '../lib/log.js'
import type { ApiRequest } from '../lib/request.js'
import { allowCall } from './rateLimit.js'

// The one place that deals with HTTP. Used by api/[name].ts on Vercel and by server/http/node.ts
// locally (pnpm dev, the API tests and the seed), so both run the same code from here on.
//
// The protocol copies Firebase callables: POST { data } with Authorization: Bearer <ID token>;
// the answer is 200 { result } or { error: { code, message } } with the callable's HTTP status.

/** The largest body accepted. A saveExpense with every member in the split is about 2 KB. */
export const MAX_BODY_BYTES = 32 * 1024

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  })
}

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number = ERROR_STATUS[code],
  extra?: Record<string, string>,
) {
  return json(status, { error: { code, message } }, extra)
}

/** A body over MAX_BODY_BYTES. Answered as invalid-argument, with HTTP 413. */
class TooLarge extends ApiError {
  constructor() {
    super('invalid-argument', 'That request is too large.')
  }
}

/** Reads the body as text, refusing it as soon as it passes the limit. */
async function readBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) throw new TooLarge()
  if (!request.body) return ''
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new TooLarge()
    }
    parts.push(value)
  }
  return Buffer.concat(parts).toString('utf8')
}

/** The verified caller, or undefined when no token was sent. A bad token is an error. */
async function caller(request: Request): Promise<ApiRequest['auth']> {
  const header = request.headers.get('authorization')
  if (header === null) return undefined
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header)
  if (!match?.[1]) throw new ApiError('unauthenticated', 'Sign in again, then retry.')
  try {
    // Also checks the token was issued for this Firebase project.
    const token = await getAuth(adminApp()).verifyIdToken(match[1])
    return { uid: token.uid, token }
  } catch {
    throw new ApiError('unauthenticated', 'Your sign-in has expired. Sign in again, then retry.')
  }
}

export async function handleApi(name: string, request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    // No CORS headers and no OPTIONS: the API is only for this site's own pages (same origin).
    return errorResponse('invalid-argument', 'Use POST.', 405, { Allow: 'POST' })
  }
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined
  if (!handler) return errorResponse('not-found', 'There is no such API call.')

  try {
    const type = request.headers.get('content-type') ?? ''
    if (!/^application\/json(;|$)/i.test(type)) {
      throw new ApiError('invalid-argument', 'Send the request as application/json.')
    }
    const text = await readBody(request)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new ApiError('invalid-argument', 'The request is not valid JSON.')
    }
    if (typeof body !== 'object' || body === null || !('data' in body)) {
      throw new ApiError('invalid-argument', 'Send the input as { "data": ... }.')
    }

    adminApp()
    const auth = await caller(request)
    if (auth && !allowCall(auth.uid)) {
      throw new ApiError('resource-exhausted', 'Too many requests. Wait a minute, then try again.')
    }

    const result = await handler({ auth, data: body.data })
    return json(200, { result: result ?? null })
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.code, error.message, error instanceof TooLarge ? 413 : undefined)
    }
    logger.error(`Unhandled error in ${name}`, { error })
    return errorResponse('internal', 'Internal error')
  }
}
