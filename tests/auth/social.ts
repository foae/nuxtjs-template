import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { consola } from 'consola'
import { and, eq, like } from 'drizzle-orm'
import { createDb } from '../../server/database/client'
import { accounts, rateLimits, users } from '../../server/database/schema'
import { createAuth } from '../../server/lib/auth'

type Identity = { sub: string, email: string }

const require = createRequire(import.meta.url)
const ssoPackage = require.resolve('@better-auth/sso')
// jose is transitive to the plugin, so its installed runtime location is selected at runtime.
const jose = await import(pathToFileURL(require.resolve('jose', { paths: [dirname(ssoPackage)] })).href)

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

function captureEnvironment(keys: readonly string[]) {
  return new Map(keys.map(key => [key, process.env[key]]))
}

function restoreEnvironment(values: Map<string, string | undefined>) {
  for (const [key, value] of values) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
}

async function main() {
  const databaseUrl = e2eDatabaseUrl()
  const runId = randomUUID()
  const origin = 'http://localhost:3000'
  const rateLimitIPPrefix = `127.83.${1 + parseInt(runId.slice(0, 2), 16) % 254}`
  const environment = captureEnvironment([
    'AUTH_BASE_URL', 'AUTH_SECRET', 'AUTH_MAIL_TRANSPORT', 'AUTH_TEST_MODE', 'AUTH_SSO_CONFIG_FILE',
    'AUTH_GOOGLE_CLIENT_ID', 'AUTH_GOOGLE_CLIENT_SECRET', 'AUTH_GITHUB_CLIENT_ID', 'AUTH_GITHUB_CLIENT_SECRET'
  ])
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256')
  const jwk = { ...await jose.exportJWK(publicKey), kid: 'social-fixture', alg: 'RS256', use: 'sig' }
  const database = createDb(databaseUrl, 1)
  let identity: Identity = { sub: 'google-fixture', email: `social-${runId}-google@example.test` }
  const realFetch = globalThis.fetch
  Object.assign(process.env, {
    AUTH_BASE_URL: origin,
    AUTH_SECRET: 'controlled-social-test-secret-at-least-32',
    AUTH_MAIL_TRANSPORT: 'capture',
    AUTH_TEST_MODE: 'true',
    AUTH_SSO_CONFIG_FILE: '',
    AUTH_GOOGLE_CLIENT_ID: 'fixture-google',
    AUTH_GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
    AUTH_GITHUB_CLIENT_ID: 'fixture-github',
    AUTH_GITHUB_CLIENT_SECRET: 'fixture-github-secret'
  })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
    if (url === 'https://oauth2.googleapis.com/token') {
      const token = await new jose.SignJWT({
        email: identity.email,
        email_verified: true,
        name: 'Social fixture',
        picture: 'https://example.test/avatar'
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'social-fixture' })
        .setSubject(identity.sub)
        .setIssuer('https://accounts.google.com')
        .setAudience('fixture-google')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)
      return Response.json({ access_token: 'fixture-access', token_type: 'Bearer', expires_in: 3600, id_token: token })
    }
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'fixture-access', token_type: 'Bearer', scope: 'user:email' })
    if (url === 'https://api.github.com/user') return Response.json({ id: identity.sub, login: 'fixture', name: 'Social fixture', email: identity.email, avatar_url: 'https://example.test/avatar' })
    if (url === 'https://api.github.com/user/emails') return Response.json([{ email: identity.email, primary: true, verified: true }])
    throw new Error(`Unexpected outbound request: ${url}`)
  }

  try {
    const auth = createAuth(database.db)
    let attempt = 0
    const flow = async (provider: 'google' | 'github', expected: boolean, tamperState = false) => {
      const jar = new Map<string, string>()
      const ip = `${rateLimitIPPrefix}.${++attempt}`
      const invoke = async (path: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers)
        headers.set('origin', origin)
        headers.set('x-auth-client-ip', ip)
        headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '))
        const response = await auth.handler(new Request(`${origin}/api/auth${path}`, { ...init, headers }))
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0]
          const separator = pair.indexOf('=')
          jar.set(pair.slice(0, separator), pair.slice(separator + 1))
        }
        return response
      }
      const start = await invoke('/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, callbackURL: `${origin}/dashboard`, errorCallbackURL: `${origin}/login` })
      })
      assert.equal(start.status, 200)
      const authorize = new URL((await start.json() as { url: string }).url)
      const state = authorize.searchParams.get('state')
      assert.ok(state)
      const callback = await invoke(`/callback/${provider}?code=fixture-code&state=${encodeURIComponent(`${state}${tamperState ? '-tampered' : ''}`)}`)
      assert.equal(callback.status, 302)
      const session = await (await invoke('/get-session')).json() as { user?: { id: string, email: string } } | null
      if (expected) {
        const user = session?.user
        assert.ok(user, 'successful social callback creates a user session')
        assert.equal(user.email, identity.email)
        assert.match(user.id, /^[a-f0-9-]{36}$/)
        return user.id
      }
      assert.equal(session, null)
      return undefined
    }

    for (const provider of ['google', 'github'] as const) {
      identity = { sub: `${provider}-${runId}`, email: `social-${runId}-${provider}@example.test` }
      const first = await flow(provider, true)
      assert.equal(await flow(provider, true), first)
      const firstAccount = await database.db.select().from(accounts).where(and(eq(accounts.providerId, provider), eq(accounts.accountId, identity.sub)))
      assert.equal(firstAccount.length, 1, `${provider} first and returning callbacks retain one provider identity`)
      assert.equal(firstAccount[0]?.userId, first)
      consola.success(`${provider} first and returning callbacks preserve identity and establish sessions.`)

      identity = { ...identity, sub: `collision-${runId}` }
      await flow(provider, false)
      const collisionAccount = await database.db.select().from(accounts).where(and(eq(accounts.providerId, provider), eq(accounts.accountId, identity.sub)))
      assert.equal(collisionAccount.length, 0, `${provider} same-email, different-subject callback must not link an account`)
      consola.success(`${provider} same-email, different-subject implicit linking is refused.`)
    }

    identity = { sub: `tampered-${runId}`, email: `social-${runId}-tampered@example.test` }
    await flow('google', false, true)
    await flow('github', false, true)
    consola.success('Google and GitHub tampered state is refused.')
  } finally {
    globalThis.fetch = realFetch
    await database.db.delete(users).where(like(users.email, `social-${runId}-%`))
    await database.db.delete(rateLimits).where(like(rateLimits.key, `${rateLimitIPPrefix}.%|%`))
    await database.close()
    restoreEnvironment(environment)
  }
}

main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
