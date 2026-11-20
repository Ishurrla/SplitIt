import { defineConfig } from 'vitest/config'

// The API handlers (server/), called over HTTP against the Auth, Firestore and Storage emulators.
// Run with `pnpm test:api`, which starts the emulators first.
export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    // One file at a time, each in its own process with its own API server (tests/api/harness.ts).
    fileParallelism: false,
    pool: 'forks',
    isolate: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['default', './tests/table-reporter.ts'],
  },
})
