import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { consola } from 'consola'
import { and, eq, inArray, like } from 'drizzle-orm'
import { createAuth } from '../../server/lib/auth'
import { createDb } from '../../server/database/client'
import * as tables from '../../server/database/schema'

const require = createRequire(import.meta.url)
const ssoPackage = require.resolve('@better-auth/sso')
// jose is transitive to the plugin, so its installed runtime location is selected at runtime.
const jose = await import(pathToFileURL(require.resolve('jose', { paths: [dirname(ssoPackage)] })).href)
const { SignJWT, exportJWK, generateKeyPair } = jose

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

interface Identity {
  sub: string
  email: string
  name: string
  tamperSignature?: boolean
}

interface AuthorizationCode {
  identity: Identity
  challenge: string
  redirectURI: string
  nonce: string | null
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

function captureCookies(response: Response, jar: Map<string, string>) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter((value): value is string => value !== null)
  for (const value of values) {
    const [pair] = value.split(';', 1)
    const separator = pair.indexOf('=')
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

function assertRedirect(response: Response, expectedPath?: string) {
  assert.ok(response.status >= 300 && response.status < 400, `expected redirect, received ${response.status}`)
  const location = response.headers.get('location')
  assert.ok(location, 'redirect response must include Location')
  if (expectedPath) assert.equal(new URL(location).pathname, expectedPath)
  return location
}

async function main() {
  const databaseUrl = e2eDatabaseUrl()
  const runId = randomUUID()
  const clientId = `oidc-${runId}`
  const clientSecret = randomUUID()
  const firstEmail = `oidc-first-${runId}@oidc.test`
  const collisionEmail = `oidc-collision-${runId}@oidc.test`
  const signatureEmail = `oidc-signature-${runId}@oidc.test`
  const stateEmail = `oidc-state-${runId}@oidc.test`
  const emails = [firstEmail, collisionEmail, signatureEmail, stateEmail]
  const rateLimitIP = `127.${1 + parseInt(runId.slice(0, 2), 16) % 254}.${1 + parseInt(runId.slice(2, 4), 16) % 254}.${1 + parseInt(runId.slice(4, 6), 16) % 254}`
  const authSecret = process.env.AUTH_SECRET ?? 'oidc-test-secret-at-least-thirty-two-characters'
  assert.ok(authSecret.length >= 32, 'AUTH_SECRET must be at least 32 characters')
  const environment = captureEnvironment(['AUTH_BASE_URL', 'AUTH_SECRET', 'AUTH_TEST_MODE', 'AUTH_MAIL_TRANSPORT', 'AUTH_SSO_CONFIG_FILE'])
  const codes = new Map<string, AuthorizationCode>()
  const cookieJar = new Map<string, string>()
  let nextIdentity: Identity | undefined
  let discoveryRequests = 0
  let jwksRequests = 0
  let idpListening = false
  const keyPair = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(keyPair.publicKey)
  Object.assign(publicJwk, { alg: 'RS256', kid: 'local-idp', use: 'sig' })

  const idp = createServer((request, response) => {
    void handleRequest().catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)))
    })
    async function handleRequest() {
      const origin = `http://${request.headers.host}`
      const url = new URL(request.url ?? '/', origin)
      const send = (status: number, value: unknown, headers: Record<string, string> = {}) => {
        response.writeHead(status, { 'content-type': 'application/json', ...headers })
        response.end(JSON.stringify(value))
      }

      if (url.pathname === '/.well-known/openid-configuration') {
        discoveryRequests += 1
        return send(200, {
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          jwks_uri: `${origin}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic']
        })
      }
      if (url.pathname === '/jwks') {
        jwksRequests += 1
        return send(200, { keys: [publicJwk] })
      }
      if (url.pathname === '/authorize') {
        const identity = nextIdentity
        assert.ok(identity, 'the fixture must select an identity before authorization')
        nextIdentity = undefined
        assert.equal(url.searchParams.get('client_id'), clientId, 'authorization client_id must match static config')
        assert.equal(url.searchParams.get('response_type'), 'code', 'authorization flow must use authorization code')
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256', 'authorization flow must use S256 PKCE')
        const state = url.searchParams.get('state')
        const challenge = url.searchParams.get('code_challenge')
        const redirectURI = url.searchParams.get('redirect_uri')
        assert.ok(state && challenge && redirectURI, 'authorization request must contain state, PKCE challenge, and redirect URI')
        const nonce = url.searchParams.get('nonce')
        const code = randomUUID()
        codes.set(code, { identity, challenge, redirectURI, nonce })
        response.writeHead(302, { location: `${redirectURI}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}` })
        return response.end()
      }
      if (url.pathname === '/token') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const form = new URLSearchParams(Buffer.concat(chunks).toString())
        const code = form.get('code')
        const record = code ? codes.get(code) : undefined
        assert.ok(record, 'token exchange must present an issued, unused authorization code')
        codes.delete(code!)
        assert.equal(form.get('grant_type'), 'authorization_code', 'token exchange must use authorization_code grant')
        assert.equal(form.get('redirect_uri'), record.redirectURI, 'token exchange redirect URI must match authorization request')
        const expectedAuth = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        assert.equal(request.headers.authorization, expectedAuth, 'token exchange must authenticate the static OIDC client')
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier') ?? ''))
        assert.equal(Buffer.from(digest).toString('base64url'), record.challenge, 'token exchange must present the verifier matching the PKCE challenge')
        let idToken = await new SignJWT({
          sub: record.identity.sub,
          email: record.identity.email,
          name: record.identity.name,
          email_verified: true,
          ...(record.nonce ? { nonce: record.nonce } : {})
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'local-idp' })
          .setIssuer(origin)
          .setAudience(clientId)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(keyPair.privateKey)
        if (record.identity.tamperSignature) {
          const [header, payload, signature] = idToken.split('.')
          idToken = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
        }
        return send(200, { access_token: `access-${randomUUID()}`, token_type: 'Bearer', expires_in: 300, id_token: idToken })
      }
      response.writeHead(404)
      response.end()
    }
  })

  const configFile = join(tmpdir(), `oidc-${runId}.json`)
  const dbHandle = createDb(databaseUrl, 1)
  try {
    await new Promise<void>((resolve, reject) => {
      idp.once('error', reject)
      idp.listen(0, '127.0.0.1', resolve)
    })
    idpListening = true
    const { port } = idp.address() as AddressInfo
    const baseURL = `http://127.0.0.1:${port}`
    const providerId = `oidc-${runId}`
    await writeFile(configFile, JSON.stringify([{
      providerId,
      label: 'Local OIDC fixture',
      domain: 'oidc.test',
      oidcConfig: {
        issuer: baseURL,
        clientId,
        clientSecret,
        discoveryEndpoint: `${baseURL}/.well-known/openid-configuration`,
        pkce: true,
        mapping: { email: 'email', name: 'name' }
      }
    }]))
    Object.assign(process.env, {
      AUTH_BASE_URL: baseURL,
      AUTH_SECRET: authSecret,
      AUTH_TEST_MODE: 'true',
      AUTH_MAIL_TRANSPORT: 'capture',
      AUTH_SSO_CONFIG_FILE: configFile
    })

    const auth = createAuth(dbHandle.db)
    const invoke = async (path: string, init: RequestInit = {}, jar = cookieJar) => {
      const headers = new Headers(init.headers)
      headers.set('origin', baseURL)
      headers.set('x-auth-client-ip', rateLimitIP)
      if (jar.size) headers.set('cookie', cookieHeader(jar))
      const response = await auth.handler(new Request(`${baseURL}/api/auth${path}`, { ...init, headers }))
      captureCookies(response, jar)
      return response
    }
    const start = async (identity: Identity, jar = new Map<string, string>()) => {
      await new Promise(resolve => setTimeout(resolve, 11_000))
      nextIdentity = identity
      const response = await invoke('/sign-in/sso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId, providerType: 'oidc', callbackURL: `${baseURL}/complete`, errorCallbackURL: `${baseURL}/failed` })
      }, jar)
      assert.equal(response.status, 200, 'SSO start must return an authorization URL')
      const payload = await response.json() as { url?: string, redirect?: boolean }
      assert.equal(payload.redirect, true, 'SSO start must require browser redirection')
      assert.ok(payload.url, 'SSO start must return an authorization URL')
      const authorize = await fetch(payload.url, { redirect: 'manual' })
      return { callback: assertRedirect(authorize), jar }
    }
    const complete = async (callback: string, jar: Map<string, string>) => {
      const url = new URL(callback)
      const response = await invoke(`${url.pathname.replace(/^\/api\/auth/, '')}${url.search}`, { method: 'GET' }, jar)
      return { response, location: assertRedirect(response) }
    }

    const firstIdentity: Identity = { sub: `first-${runId}`, email: firstEmail, name: 'OIDC First' }
    const first = await start(firstIdentity)
    const firstDone = await complete(first.callback, first.jar)
    assert.equal(new URL(firstDone.location).pathname, '/complete', 'first OIDC sign-in must return to callback URL')
    const firstSessionResponse = await invoke('/get-session', { method: 'GET' }, first.jar)
    assert.equal(firstSessionResponse.status, 200, 'first OIDC sign-in must create a session')
    const firstSession = await firstSessionResponse.json() as { user: { id: string, email: string }, session: { userId: string } }
    assert.match(firstSession.user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'OIDC user ID must be UUID')
    assert.equal(firstSession.user.email, firstIdentity.email, 'OIDC session must belong to provider identity email')
    assert.equal(firstSession.session.userId, firstSession.user.id, 'OIDC session must bind to the UUID identity')
    const firstAccounts = await dbHandle.db.select().from(tables.accounts).where(and(eq(tables.accounts.providerId, providerId), eq(tables.accounts.accountId, firstIdentity.sub)))
    assert.equal(firstAccounts.length, 1, 'first OIDC sign-in must create exactly one provider identity')
    assert.equal(firstAccounts[0]?.userId, firstSession.user.id, 'provider identity must bind to first UUID user')
    assert.ok(discoveryRequests > 0, 'static OIDC configuration must fetch the local discovery document')
    assert.ok(jwksRequests > 0, 'OIDC ID-token verification must fetch the local JWKS')
    consola.success('OIDC static configuration resolves the local discovery document and JWKS; first sign-in creates its UUID user, account, and session.')

    const repeat = await start(firstIdentity)
    const repeatDone = await complete(repeat.callback, repeat.jar)
    assert.equal(new URL(repeatDone.location).pathname, '/complete', 'repeat OIDC sign-in must return to callback URL')
    const repeatSession = await (await invoke('/get-session', { method: 'GET' }, repeat.jar)).json() as { user: { id: string } }
    assert.equal(repeatSession.user.id, firstSession.user.id, 'same OIDC subject must sign into the original user')
    const repeatAccounts = await dbHandle.db.select().from(tables.accounts).where(and(eq(tables.accounts.providerId, providerId), eq(tables.accounts.accountId, firstIdentity.sub)))
    assert.equal(repeatAccounts.length, 1, 'repeat OIDC sign-in must not create a second provider identity')
    consola.success('OIDC returning subject resolves to the same user.')

    const passwordResponse = await invoke('/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Password Collision', email: collisionEmail, password: `Password-${runId}!` })
    }, new Map())
    assert.ok(passwordResponse.status >= 200 && passwordResponse.status < 300, 'password sign-up must create collision fixture user')
    const collision = await start({ sub: `collision-${runId}`, email: collisionEmail, name: 'OIDC Collision' })
    const collisionDone = await complete(collision.callback, collision.jar)
    const collisionLocation = new URL(collisionDone.location)
    assert.equal(collisionLocation.pathname, '/failed', 'email collision must be refused through error callback')
    assert.ok(collisionLocation.searchParams.get('error'), 'email collision must expose an authentication refusal code')
    const collisionAccounts = await dbHandle.db.select().from(tables.accounts).where(and(eq(tables.accounts.providerId, providerId), eq(tables.accounts.accountId, `collision-${runId}`)))
    assert.equal(collisionAccounts.length, 0, 'OIDC email collision must not implicitly link the password user')
    consola.success('OIDC email collision refuses implicit account linking.')

    const signature = await start({ sub: `signature-${runId}`, email: signatureEmail, name: 'Bad Signature', tamperSignature: true })
    const signatureDone = await complete(signature.callback, signature.jar)
    const signatureLocation = new URL(signatureDone.location)
    assert.equal(signatureLocation.pathname, '/failed', 'tampered ID token must be refused through error callback')
    assert.equal(signatureLocation.searchParams.get('error'), 'invalid_provider', 'tampered ID token must be classified as invalid provider response')
    consola.success('OIDC tampered ID-token signature is refused.')

    const state = await start({ sub: `state-${runId}`, email: stateEmail, name: 'Bad State' })
    const stateURL = new URL(state.callback)
    stateURL.searchParams.set('state', `${stateURL.searchParams.get('state')}tampered`)
    const stateResponse = await invoke(`${stateURL.pathname.replace(/^\/api\/auth/, '')}${stateURL.search}`, { method: 'GET' }, state.jar)
    assert.equal(new URL(assertRedirect(stateResponse)).pathname, '/api/auth/error', 'tampered state must be refused before callback processing')
    assert.equal(await (await invoke('/get-session', { method: 'GET' }, state.jar)).json(), null, 'tampered state must not create a session')
    consola.success('OIDC tampered state is refused.')

    const managementPaths = ['/sso/register', '/sso/update-provider', '/sso/delete-provider', '/sso/request-domain-verification', '/sso/verify-domain', '/sso/providers', '/sso/get-provider']
    for (const path of managementPaths) {
      const anonymous = await invoke(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, new Map())
      assert.equal(anonymous.status, 404, `${path} must be unavailable anonymously`)
      const authenticated = await invoke(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, first.jar)
      assert.equal(authenticated.status, 404, `${path} must be unavailable to authenticated users`)
    }
    consola.success('SSO provider-management routes are disabled for anonymous and authenticated requests.')
  } finally {
    await dbHandle.db.delete(tables.rateLimits).where(like(tables.rateLimits.key, `${rateLimitIP}|%`))
    await dbHandle.db.delete(tables.users).where(inArray(tables.users.email, emails))
    await dbHandle.close()
    await rm(configFile, { force: true })
    if (idpListening) await new Promise<void>((resolve, reject) => idp.close(error => error ? reject(error) : resolve()))
    restoreEnvironment(environment)
  }
}

main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
