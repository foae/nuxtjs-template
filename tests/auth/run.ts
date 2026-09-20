import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'

// No local .env loading: provider fixtures must never inherit deployment credentials.
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
