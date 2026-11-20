import { getFirestore, type DocumentReference } from 'firebase-admin/firestore'
import { logger } from '../lib/log.js'
import { z } from 'zod'
import { ApiError } from '../lib/errors.js'
import { defineHandler, parseInput, requireAuth } from '../lib/request.js'
import { bucket, requireStorage, storageEnabled } from '../lib/storage.js'
import { MAX_BATCH_WRITES, chunks } from '../lib/chunks.js'

export const updateProfileInput = z
  .strictObject({
    displayName: z
      .string()
      .trim()
      .min(1, 'Enter a name.')
      .max(60, 'Use 60 characters or fewer.')
      .regex(/^[^\p{Cc}]*$/u, 'Remove line breaks and control characters.')
      .optional(),
    photoPath: z.string().max(300).nullable().optional(),
  })
  .refine((d) => d.displayName !== undefined || d.photoPath !== undefined, {
    message: 'Send a displayName or a photoPath to change.',
  })

export type UpdateProfileInput = z.input<typeof updateProfileInput>
export interface UpdateProfileResult {
  groupsUpdated: number
}

type ProfileChanges = { displayName?: string; photoPath?: string | null }

/**
 * Changes your name and/or photo, and copies them onto your member document in every group you
 * are in, so other members see the new values without being able to read your users document.
 *
 * Batches hold at most 500 writes, so many groups mean several batches, which are not atomic
 * together. The member copies are written first and users/{uid} last: if a batch fails, your
 * profile still shows the old values, and calling again repairs every copy (the call is idempotent).
 */
export const updateProfile = defineHandler<UpdateProfileResult>(async (request) => {
  const uid = requireAuth(request)
  const input = parseInput(updateProfileInput, request.data)

  const changes: ProfileChanges = {}
  if (input.displayName !== undefined) changes.displayName = input.displayName
  if (input.photoPath !== undefined) {
    if (input.photoPath !== null) await assertOwnUploadedAvatar(uid, input.photoPath)
    changes.photoPath = input.photoPath
  }

  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new ApiError(
      'failed-precondition',
      'Your profile has not been set up yet. Sign out, sign in again, then retry.',
    )
  }

  const myGroups = await db
    .collection('groups')
    .where('memberIds', 'array-contains', uid)
    .select()
    .get()
  const memberRefs = myGroups.docs.map((g) => g.ref.collection('members').doc(uid))

  const writes: DocumentReference[] = [...memberRefs, userRef]
  for (const piece of chunks(writes, MAX_BATCH_WRITES)) {
    const batch = db.batch()
    for (const ref of piece) batch.update(ref, changes)
    // Sequential on purpose: users/{uid} is in the last batch and must only change after the copies.
    await batch.commit()
  }

  // Tidy up the photo that was replaced or removed. Best effort: a leftover file is harmless.
  const previous = (userSnap.data() as { photoPath?: string | null }).photoPath ?? null
  if (
    storageEnabled() &&
    input.photoPath !== undefined &&
    previous &&
    previous !== input.photoPath
  ) {
    await bucket()
      .file(previous)
      .delete({ ignoreNotFound: true })
      .catch((error: unknown) => {
        logger.warn('Could not delete old profile photo', { previous, error })
      })
  }

  return { groupsUpdated: memberRefs.length }
})

async function assertOwnUploadedAvatar(uid: string, photoPath: string): Promise<void> {
  requireStorage()
  const parts = photoPath.split('/')
  if (parts.length !== 3 || parts[0] !== 'avatars' || parts[1] !== uid || !parts[2]) {
    throw new ApiError(
      'invalid-argument',
      `photoPath: Upload your photo to avatars/${uid}/ and send that path.`,
    )
  }
  const [exists] = await bucket().file(photoPath).exists()
  if (!exists) {
    throw new ApiError(
      'failed-precondition',
      'That photo has not finished uploading. Upload it again, then save.',
    )
  }
}
