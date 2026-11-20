import { getFirestore } from 'firebase-admin/firestore'
import { logger } from '../lib/log.js'
import { ApiError } from '../lib/errors.js'
import { defineHandler, parseInput, requireAuth } from '../lib/request.js'
import { bucket, requireStorage, storageEnabled } from '../lib/storage.js'
import { addActivity, groupRef, readMembership } from '../lib/groups.js'
import { updateGroupInput } from '../shared/schemas.js'

/**
 * Owner only: rename the group or change its cover (an illustration, or a photo already uploaded
 * to covers/{groupId}/). The currency is deliberately not editable here.
 */
export const updateGroup = defineHandler<{ ok: true }>(async (request) => {
  const uid = requireAuth(request)
  const input = parseInput(updateGroupInput, request.data)
  const { groupId } = input

  if (typeof input.coverPath === 'string') {
    requireStorage()
    const parts = input.coverPath.split('/')
    if (parts.length !== 3 || parts[0] !== 'covers' || parts[1] !== groupId || !parts[2]) {
      throw new ApiError(
        'invalid-argument',
        `coverPath: Upload the photo to covers/${groupId}/ first.`,
      )
    }
    const [exists] = await bucket().file(input.coverPath).exists()
    if (!exists) {
      throw new ApiError(
        'failed-precondition',
        'That photo has not finished uploading. Upload it again, then save.',
      )
    }
  }

  const previousCover = await getFirestore().runTransaction(async (tx) => {
    const { group } = await readMembership(tx, groupId, uid, 'owner')
    const changes: Record<string, string | null> = {}
    if (input.name !== undefined) changes.name = input.name
    if (input.cover !== undefined) changes.cover = input.cover
    if (input.coverPath !== undefined) changes.coverPath = input.coverPath
    tx.update(groupRef(groupId), changes)
    addActivity(tx, groupId, uid, 'group.updated', { name: input.name ?? null })
    return input.coverPath !== undefined ? group.coverPath : null
  })

  // Tidy up the replaced photo. Best effort: a leftover file is harmless, so don't fail the call.
  if (storageEnabled() && previousCover && previousCover !== input.coverPath) {
    await bucket()
      .file(previousCover)
      .delete({ ignoreNotFound: true })
      .catch((error: unknown) => {
        logger.warn('Could not delete old cover photo', { previousCover, error })
      })
  }
  return { ok: true }
})
