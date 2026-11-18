import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, fitWithin, imageProblem } from './images'

describe('imageProblem', () => {
  it('accepts JPEG, PNG and WebP under 5 MB', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(imageProblem({ type: 'image/png', size: MAX_UPLOAD_BYTES - 1 })).toBeNull()
    expect(imageProblem({ type: 'image/webp', size: 1 })).toBeNull()
  })

  it('rejects other types, SVG included', () => {
    expect(imageProblem({ type: 'image/svg+xml', size: 10 })).toMatch(/not a photo/)
    expect(imageProblem({ type: 'application/pdf', size: 10 })).toMatch(/not a photo/)
    expect(imageProblem({ type: '', size: 10 })).toMatch(/not a photo/)
  })

  it('rejects 5 MB and over, matching storage.rules', () => {
    expect(imageProblem({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES })).toMatch(/5 MB/)
  })
})

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(1080, 1920, 1600)).toEqual({ width: 900, height: 1600 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})
