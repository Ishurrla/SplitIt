// Calls the API (server/http/handle.ts): POST /api/<name> with { data } and the caller's Firebase
// ID token. Kept free of Firebase imports so the API tests call the server through this same code.
//
// Errors come back with the same codes the callable Cloud Functions used ("functions/<code>"), so
// callableErrorMessage, isConnectionError and every screen read them as before.

const CODES = new Set([
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'unauthenticated',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
])

/** A failed API call. `code` is "functions/<code>", for example "functions/permission-denied". */
export class ApiCallError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiCallError'
    this.code = `functions/${code}`
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * POSTs `data` to `url` and returns the result.
 * `idToken` is null when signed out; the server then answers unauthenticated where sign-in is needed.
 */
export async function postApi(
  url: string,
  data: unknown,
  idToken: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idToken) headers.Authorization = `Bearer ${idToken}`

  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ data }) })
  } catch {
    throw new ApiCallError('unavailable', "Couldn't reach the server.")
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    // Not our API's answer: a platform error page, a timeout, or no server at all.
    throw new ApiCallError(response.status === 404 ? 'unavailable' : 'internal', 'Internal error')
  }
  if (response.ok && isRecord(body) && 'result' in body) return body.result

  const error = isRecord(body) && isRecord(body.error) ? body.error : {}
  const code = typeof error.code === 'string' && CODES.has(error.code) ? error.code : 'internal'
  const message = typeof error.message === 'string' ? error.message : 'Internal error'
  throw new ApiCallError(code, message)
}
