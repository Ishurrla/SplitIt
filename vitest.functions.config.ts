import { defineConfig } from 'vitest/config'

// Callable Cloud Functions, called through the client SDK against the emulators.
// Run with `pnpm test:functions` (builds functions/ first).
export default defineConfig({
  test: {
    include: ['tests/functions/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['default', './tests/table-reporter.ts'],
  },
})
