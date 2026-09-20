import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'

// Each process gets a fresh module singleton and an explicit, isolated environment.
if (process.argv.includes('--child')) {
  const { authConfiguration } = await import('../../server/lib/auth')
  const config = authConfiguration()
  if (config.providers.length) {
    assert.equal(config.isTrustedOIDCEndpoint('enterprise', 'https://idp.example/token'), true)
    assert.equal(config.isTrustedOIDCEndpoint('enterprise', 'https://untrusted.example/token'), false)
    const { DiscoveryError } = await import('@better-auth/sso')
    assert.throws(() => config.isTrustedOIDCEndpoint('enterprise', 'http://idp.example/token'), DiscoveryError)
    assert.throws(() => config.isTrustedOIDCEndpoint('enterprise', 'not a URL'), DiscoveryError)
  }
} else {
  const directory = mkdtempSync(join(tmpdir(), 'auth-config-'))
  const oidc = { issuer: 'https://idp.example', discoveryEndpoint: 'https://idp.example/discovery', clientId: 'fixture-client', clientSecret: 'fixture-secret' }
  const provider = { providerId: 'enterprise', label: 'Enterprise', domain: 'example.com', oidcConfig: oidc }
  const base = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    AUTH_BASE_URL: 'https://app.example',
    AUTH_SECRET: 'configuration-test-secret-at-least-32-characters',
    AUTH_MAIL_TRANSPORT: 'ses',
    AWS_REGION: 'us-east-1',
    AUTH_EMAIL_FROM: 'test@example.com'
  }
  type Scenario = { name: string, env?: Record<string, string>, providers?: unknown, raw?: string, accepted?: boolean }
  const scenarios: Scenario[] = [
    { name: 'valid production OIDC', providers: [provider], accepted: true },
    { name: 'issuer discovery fallback', providers: [{ ...provider, oidcConfig: { ...oidc, discoveryEndpoint: undefined } }], accepted: true },
    { name: 'explicit endpoints', providers: [{ ...provider, oidcConfig: { ...oidc, discoveryEndpoint: undefined, skipDiscovery: true, authorizationEndpoint: 'https://idp.example/authorize', tokenEndpoint: 'https://idp.example/token', jwksEndpoint: 'https://idp.example/jwks' } }], accepted: true },
    { name: 'incomplete explicit endpoints', providers: [{ ...provider, oidcConfig: { ...oidc, skipDiscovery: true } }] },
    { name: 'insecure production endpoint', providers: [{ ...provider, oidcConfig: { ...oidc, tokenEndpoint: 'http://idp.example/token' } }] },
    { name: 'credentialed endpoint', providers: [{ ...provider, oidcConfig: { ...oidc, tokenEndpoint: 'https://user:secret@idp.example/token' } }] },
    { name: 'duplicate provider', providers: [provider, provider] },
    { name: 'reserved provider', providers: [{ ...provider, providerId: 'google' }] },
    { name: 'unknown provider field', providers: [{ ...provider, organizationId: 'forbidden' }] },
    { name: 'missing protocol', providers: [{ providerId: 'enterprise', label: 'Enterprise', domain: 'example.com' }] },
    { name: 'missing client secret', providers: [{ ...provider, oidcConfig: { ...oidc, clientSecret: '' } }] },
    { name: 'missing private key', providers: [{ ...provider, oidcConfig: { ...oidc, tokenEndpointAuthentication: 'private_key_jwt' } }] },
    { name: 'malformed configuration', raw: '{invalid-json' },
    { name: 'missing configuration file', env: { AUTH_SSO_CONFIG_FILE: join(directory, 'missing.json') } },
    { name: 'invalid base URL', env: { AUTH_BASE_URL: 'not a URL' } },
    { name: 'HTTP production base URL', env: { AUTH_BASE_URL: 'http://app.example' } },
    { name: 'base URL with path', env: { AUTH_BASE_URL: 'https://app.example/path' } },
    { name: 'remote test mode', env: { AUTH_TEST_MODE: 'true' } },
    { name: 'production capture', env: { AUTH_MAIL_TRANSPORT: 'capture' } },
    { name: 'missing SES sender', env: { AUTH_EMAIL_FROM: '' } },
    { name: 'implicit mail transport', env: { AUTH_MAIL_TRANSPORT: '' } },
    { name: 'invalid proxy', env: { AUTH_TRUSTED_PROXY_IPS: 'proxy.example' } },
    { name: 'valid literal proxies', env: { AUTH_TRUSTED_PROXY_IPS: '127.0.0.1,::1' }, accepted: true },
    { name: 'partial social credentials', env: { AUTH_GOOGLE_CLIENT_ID: 'fixture' } },
    { name: 'explicit loopback capture', env: { AUTH_BASE_URL: 'http://localhost:3199', AUTH_TEST_MODE: 'true', AUTH_MAIL_TRANSPORT: 'capture' }, accepted: true }
  ]
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const path = join(directory, `${index}.json`)
      writeFileSync(path, scenario.raw ?? JSON.stringify(scenario.providers ?? []))
      const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child'], {
        env: { ...base, AUTH_SSO_CONFIG_FILE: path, ...scenario.env }, encoding: 'utf8', timeout: 30_000
      })
      assert.ifError(result.error)
      assert.equal(result.signal, null, scenario.name)
      assert.equal(result.status === 0, scenario.accepted === true, `${scenario.name}\n${result.stderr}`)
    }
    consola.success(`${scenarios.length} authentication startup/transport scenarios passed`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
