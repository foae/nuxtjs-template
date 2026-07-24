import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3199)

/**
 * E2E covers only the few flows that break most often and that unit tests
 * cannot reach: sign in, create, and the authorization rules around drafts.
 * Everything else belongs in `tests/unit` — the agent's verify loop has to
 * stay fast, and `pnpm verify` deliberately does not run this suite.
 *
 * Requires a database:  pnpm db:up && pnpm db:reset && pnpm test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  webServer: {
    // Built output, not `nuxt dev` — closer to what actually ships, and it
    // avoids flakiness from HMR recompiling mid-test.
    command: `node .output/server/index.mjs`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NITRO_PORT: String(PORT),
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app',
      NUXT_SESSION_PASSWORD:
        process.env.NUXT_SESSION_PASSWORD ?? 'e2e-session-password-at-least-32-chars'
    }
  }
})
