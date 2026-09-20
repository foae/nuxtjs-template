import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

function e2eDatabaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL
  if (!value) throw new Error('E2E_DATABASE_URL is required; it must name a disposable database ending in "_e2e".')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL connection URL.')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('E2E_DATABASE_URL must be a PostgreSQL connection URL.')
  }

  const database = decodeURIComponent(url.pathname).replace(/^\//, '')
  if (!database.endsWith('_e2e') || database.includes('/')) {
    throw new Error('E2E_DATABASE_URL must name a disposable database ending in "_e2e".')
  }

  return value
}

const E2E_DATABASE_URL = e2eDatabaseUrl()
const AUTH_MAIL_CAPTURE_DIR = process.env.PLAYWRIGHT_AUTH_MAIL_DIR ?? mkdtempSync(join(tmpdir(), 'nuxt-e2e-auth-mail-'))
const PORT = Number(process.env.E2E_PORT ?? 3199)
const BASE_URL = `http://localhost:${PORT}`

// Test workers inherit this location to inspect captured Better Auth mail.
process.env.AUTH_MAIL_CAPTURE_DIR = AUTH_MAIL_CAPTURE_DIR
process.env.PLAYWRIGHT_AUTH_MAIL_DIR = AUTH_MAIL_CAPTURE_DIR
process.env.E2E_DATABASE_URL = E2E_DATABASE_URL
process.env.AUTH_BASE_URL = BASE_URL

/**
 * E2E covers only the few flows that break most often and that unit tests
 * cannot reach: sign in, create, and the authorization rules around drafts.
 * Everything else belongs in `tests/unit` — the agent's verify loop has to
 * stay fast, and `pnpm verify` deliberately does not run this suite.
 *
 * Requires an explicit disposable database, for example:
 * `E2E_DATABASE_URL=postgres://app:app@localhost:5432/template_e2e pnpm test:e2e`
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
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
    // Never reuse: a server already listening on this port would be served
    // instead of the build that was just made, which is a silent false green.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NITRO_PORT: String(PORT),
      NODE_ENV: 'production',
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_BASE_URL: BASE_URL,
      AUTH_SECRET: 'e2e-auth-secret-must-be-at-least-thirty-two-characters',
      AUTH_TEST_MODE: 'true',
      AUTH_MAIL_TRANSPORT: 'capture',
      AUTH_MAIL_CAPTURE_DIR,
      AUTH_GOOGLE_CLIENT_ID: '',
      AUTH_GOOGLE_CLIENT_SECRET: '',
      AUTH_GITHUB_CLIENT_ID: '',
      AUTH_GITHUB_CLIENT_SECRET: '',
      AUTH_SSO_CONFIG_FILE: ''
    }
  }
})
