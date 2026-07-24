import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Unit tests here are pure (schemas, mappers) and need no browser or
    // Nuxt runtime, so the default environment stays `node` for speed —
    // the agent's verify loop has to be fast to be run often.
    // Add `// @vitest-environment nuxt` at the top of a file that needs
    // the Nuxt runtime instead of slowing every test down.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['dot']
  }
})
