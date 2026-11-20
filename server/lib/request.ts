import type { DecodedIdToken } from 'firebase-admin/auth'
import type { z } from 'zod'
import { ApiError } from './errors.js'

/**
 * What a handler receives: who is calling (from a verified Firebase ID token) and the input.
 * The same shape as a Firebase CallableRequest, so the handlers read exactly as the callables did.
 */
export interface ApiRequest {
  auth?: { uid: string; token: DecodedIdToken }
  data: unknown
}

export type Handler<R = unknown> = (request: ApiRequest) => Promise<R>

/** Marks a function as an API handler (server/handlers/index.ts lists them all). */
export function defineHandler<R>(fn: Handler<R>): Handler<R> {
  return fn
}

/** The caller's uid, or an `unauthenticated` error. Every handler starts with this. */
export function requireAuth(request: ApiRequest): string {
  const uid = request.auth?.uid
  if (!uid) throw new ApiError('unauthenticated', 'Sign in to do this.')
  return uid
}

/** Validates handler input. Errors name the field and say what is wrong with it. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue?.path.join('.')
  const message = issue?.message ?? 'Invalid input.'
  throw new ApiError('invalid-argument', field ? `${field}: ${message}` : message)
}
