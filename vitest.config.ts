import { defineConfig } from 'vitest/config'

// Unit tests only. Rules tests get their own config in Phase 1 because they need the emulators.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    passWithNoTests: true,
  },
})
