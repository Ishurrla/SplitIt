/**
 * The error codes the API answers with. The same codes, and the same HTTP statuses, as Firebase
 * callables used, so the client keeps telling them apart in the same way.
 */
export const ERROR_STATUS = {
  cancelled: 499,
  unknown: 500,
  'invalid-argument': 400,
  'deadline-exceeded': 504,
  'not-found': 404,
  'already-exists': 409,
  'permission-denied': 403,
  unauthenticated: 401,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  aborted: 409,
  'out-of-range': 400,
  unimplemented: 501,
  internal: 500,
  unavailable: 503,
  'data-loss': 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

/**
 * An error whose code and message are sent to the caller as they are. Any other error becomes
 * `internal` with no details, so nothing about the server leaks.
 */
export class ApiError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
