import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Unit tests here are pure (schemas, mappers) and need no browser or
    // Nuxt runtime, so the default environment stays `node` for speed.
    // Runtime cases opt in with `// @vitest-environment nuxt`; keeping their
    // discovery explicit makes both `pnpm test` and the aggregate checks run
    // them without slowing the pure units down.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/nuxt/**/*.test.ts'],
    reporters: ['dot']
  }
})
