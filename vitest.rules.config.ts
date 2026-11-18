import { defineConfig } from 'vitest/config'

// Security rules tests. Needs the Firestore and Storage emulators: run with `pnpm test:rules`.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    fileParallelism: false, // both files share one emulator and clear it before seeding
    testTimeout: 20_000,
    hookTimeout: 60_000,
    reporters: ['default', './tests/table-reporter.ts'],
  },
})
