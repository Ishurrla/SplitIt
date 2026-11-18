import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { z } from 'zod'

/** The caller's uid, or an `unauthenticated` error. Every callable starts with this. */
export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to do this.')
  return uid
}

/** Validates callable input. Errors name the field and say what is wrong with it. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue?.path.join('.')
  const message = issue?.message ?? 'Invalid input.'
  throw new HttpsError('invalid-argument', field ? `${field}: ${message}` : message)
}
