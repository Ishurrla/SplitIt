import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// The client and the API each have their own copy of money.ts (the server code is bundled
// separately). This test fails the moment the two copies differ.
it('client and server money.ts are identical', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
  expect(read('./money.ts')).toBe(read('../../src/lib/money.ts'))
})
