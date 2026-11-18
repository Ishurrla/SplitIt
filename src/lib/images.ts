// Photos chosen in the browser (covers now, receipts in Phase 4, avatars in Phase 7).
// Checked first, then shrunk to a JPEG of at most 1600px on the long side before upload, which
// keeps them well under the 5 MB limit that storage.rules enforces.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPT_ATTR = ACCEPTED.join(',')

/** What is wrong with the chosen file, in words for the person, or null if it is fine. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ACCEPTED.includes(file.type))
    return 'That file is not a photo. Choose a JPG, PNG or WebP image.'
  if (file.size >= MAX_UPLOAD_BYTES) return 'That photo is 5 MB or more. Choose a smaller one.'
  return null
}

/** The size to draw at so the long side is at most `max`, keeping the shape. Never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Re-encodes the photo as a JPEG no larger than `max` px on its long side. */
export async function resizeToJpeg(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const size = fitWithin(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize photos.')
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not read that photo. Try another.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

/** A random file name, so a new upload never overwrites a photo someone is still looking at. */
export function newPhotoName(): string {
  return `${crypto.randomUUID()}.jpg`
}
