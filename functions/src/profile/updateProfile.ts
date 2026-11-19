import { getFirestore, type DocumentReference } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { parseInput, requireAuth } from '../lib/callable.js'
import { MAX_BATCH_WRITES, chunks } from '../lib/chunks.js'
import { callableOptions } from '../lib/options.js'

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
export const updateProfile = onCall<unknown, Promise<UpdateProfileResult>>(
  callableOptions,
  async (request) => {
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
      throw new HttpsError(
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
    if (input.photoPath !== undefined && previous && previous !== input.photoPath) {
      await getStorage()
        .bucket()
        .file(previous)
        .delete({ ignoreNotFound: true })
        .catch((error: unknown) => {
          logger.warn('Could not delete old profile photo', { previous, error })
        })
    }

    return { groupsUpdated: memberRefs.length }
  },
)

async function assertOwnUploadedAvatar(uid: string, photoPath: string): Promise<void> {
  const parts = photoPath.split('/')
  if (parts.length !== 3 || parts[0] !== 'avatars' || parts[1] !== uid || !parts[2]) {
    throw new HttpsError(
      'invalid-argument',
      `photoPath: Upload your photo to avatars/${uid}/ and send that path.`,
    )
  }
  const [exists] = await getStorage().bucket().file(photoPath).exists()
  if (!exists) {
    throw new HttpsError(
      'failed-precondition',
      'That photo has not finished uploading. Upload it again, then save.',
    )
  }
}
