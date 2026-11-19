import { ref, uploadBytes } from 'firebase/storage'
import { updateGroup } from '../lib/callables'
import { storage } from '../lib/firebaseServices'
import { newPhotoName, resizeToJpeg } from '../lib/images'

/**
 * Shrinks the photo, uploads it to covers/{groupId}/ (owner only, per storage.rules), then asks
 * updateGroup to use it. updateGroup checks the file exists and deletes the previous cover.
 */
export async function uploadCover(groupId: string, file: File): Promise<void> {
  const jpeg = await resizeToJpeg(file)
  const path = `covers/${groupId}/${newPhotoName()}`
  await uploadBytes(ref(storage, path), jpeg, { contentType: 'image/jpeg' })
  await updateGroup({ groupId, coverPath: path })
}
