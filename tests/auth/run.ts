import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'

// `.env` IS loaded (see the --env-file-if-exists flag on the test:auth script), but
// only so E2E_DATABASE_URL can be configured there. Provider fixtures must never
// inherit deployment credentials, so the child env below stays an explicit
// allowlist — do not widen it to `...process.env`, or a real AWS_REGION,
// AUTH_EMAIL_FROM or provider secret from `.env` reaches the SES/social fixtures.
const database = process.env.E2E_DATABASE_URL
if (!database) throw new Error('E2E_DATABASE_URL must name an initialized disposable database ending in _e2e')
const url = new URL(database)
const name = decodeURIComponent(url.pathname).slice(1)
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !name.endsWith('_e2e') || name.includes('/')) {
  throw new Error('E2E_DATABASE_URL must name a disposable PostgreSQL database ending in _e2e')
}
for (const fixture of ['config', 'ses', 'social', 'oidc', 'saml']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL(`./${fixture}.ts`, import.meta.url))], {
    env: { PATH: process.env.PATH, E2E_DATABASE_URL: database },
    stdio: 'inherit',
    timeout: 120_000
  })
  if (result.error || result.status !== 0) throw new Error(`Authentication fixture ${fixture} failed`, { cause: result.error })
}
consola.success('Controlled authentication provider, mail and configuration regressions passed')
