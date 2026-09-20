import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { consola } from 'consola'
import { like } from 'drizzle-orm'
import { z } from 'zod'
import { createAuth } from '../../server/lib/auth'
import { createDb, type DbHandle } from '../../server/database/client'
import * as tables from '../../server/database/schema'

type SamlRequestInfo = { extract: { request?: { id?: string } } }
type SamlResponse = { context: string }
type SamlEntity = {
  createLoginResponse: (sp: SamlEntity, requestInfo: SamlRequestInfo, binding: 'post', user: { email: string }, options: {
    relayState?: string
    customTagReplacement?: () => SamlResponse
  }) => Promise<SamlResponse>
  parseLoginRequest: (sp: SamlEntity, binding: 'redirect', request: { query: { SAMLRequest: string } }) => Promise<SamlRequestInfo>
}
type SamlModule = {
  SamlLib: {
    defaultLoginResponseTemplate: { context: string }
    replaceTagsByValue: (template: string, values: Record<string, string>) => string
  }
  ServiceProvider: (settings: Record<string, unknown>) => SamlEntity
  IdentityProvider: (settings: Record<string, unknown>) => SamlEntity
}
type ResponseOptions = {
  assertionId?: string
  audience?: string
  notBefore?: string
  notOnOrAfter?: string
  omitInResponseTo?: boolean
}
type IdpReply = z.infer<typeof IdpReplySchema>
type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>
type CookieJar = Map<string, string>

const execFile = promisify(execFileCallback)
const saml = createRequire(import.meta.resolve('@better-auth/sso'))('samlify') as unknown as SamlModule
const IdpReplySchema = z.object({ SAMLResponse: z.string(), RelayState: z.string().optional() })
const SignInReplySchema = z.object({ url: z.string().url() })
const SessionSnapshotSchema = z.object({
  session: z.object({ id: z.string().optional() }).optional(),
  user: z.object({ id: z.string().optional() }).optional()
}).nullable()

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function hasGetSetCookie(headers: Headers): headers is Headers & { getSetCookie: () => string[] } {
  return 'getSetCookie' in headers && typeof headers.getSetCookie === 'function'
}

function setCookies(jar: CookieJar, headers: Headers) {
  const fallback = headers.get('set-cookie')
  const values = hasGetSetCookie(headers) ? headers.getSetCookie() : fallback ? [fallback] : []
  for (const value of values) {
    const pair = value.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
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
  const runId = randomUUID().replaceAll('-', '')
  const providerId = `saml_${runId}`
  const nameId = `${providerId}@example.test`
  const idpEntityId = `urn:saml:idp:${providerId}`
  const spEntityId = `urn:saml:sp:${providerId}`
  const callbackPath = '/saml-complete'
  const apiPath = '/api/auth'
  const rateLimitIP = `127.${1 + parseInt(runId.slice(0, 2), 16) % 254}.${1 + parseInt(runId.slice(2, 4), 16) % 254}.${1 + parseInt(runId.slice(4, 6), 16) % 254}`
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'saml-probe-'))
  const keyPath = join(temporaryDirectory, 'idp-key.pem')
  const certificatePath = join(temporaryDirectory, 'idp-cert.pem')
  const configPath = join(temporaryDirectory, 'sso-providers.json')
  const environment = captureEnvironment(['AUTH_BASE_URL', 'AUTH_SECRET', 'AUTH_SSO_CONFIG_FILE', 'AUTH_MAIL_TRANSPORT', 'AUTH_TEST_MODE'])
  let db: DbHandle | undefined
  let server: Server | undefined
  let serverListening = false

  const xmlDate = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
  const responseXml = (options: ResponseOptions, requestId: string, acsUrl: string) => {
    const template = saml.SamlLib.defaultLoginResponseTemplate.context
    const notBefore = options.notBefore ?? xmlDate(-60_000)
    const notOnOrAfter = options.notOnOrAfter ?? xmlDate(5 * 60_000)
    return saml.SamlLib.replaceTagsByValue(template, {
      ID: `_${randomUUID()}`,
      AssertionID: options.assertionId ?? `_${randomUUID()}`,
      Destination: acsUrl,
      Audience: options.audience ?? spEntityId,
      EntityID: spEntityId,
      SubjectRecipient: acsUrl,
      Issuer: idpEntityId,
      IssueInstant: xmlDate(0),
      AssertionConsumerServiceURL: acsUrl,
      StatusCode: 'urn:oasis:names:tc:SAML:2.0:status:Success',
      ConditionsNotBefore: notBefore,
      ConditionsNotOnOrAfter: notOnOrAfter,
      SubjectConfirmationDataNotOnOrAfter: notOnOrAfter,
      NameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      NameID: nameId,
      InResponseTo: options.omitInResponseTo ? '' : requestId,
      AuthnStatement: '',
      AttributeStatement: ''
    })
  }

  try {
    await execFile('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certificatePath,
      '-subj', `/CN=${providerId}.test`, '-days', '1'
    ])
    const [privateKey, certificate] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certificatePath, 'utf8')])
    let origin = ''
    let acsUrl = ''
    let nextResponse: ResponseOptions = {}
    const sendJson = (response: ServerResponse, value: unknown, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(value))
    }
    const makeResponse = async (requestInfo: SamlRequestInfo, relayState: string | undefined, options: ResponseOptions): Promise<IdpReply> => {
      assert(localIdp && localSp, 'local SAML entities are initialized')
      if (Object.keys(options).length === 0) {
        const result = await localIdp.createLoginResponse(localSp, requestInfo, 'post', { email: nameId }, { relayState })
        return { SAMLResponse: result.context, RelayState: relayState }
      }
      const result = await localIdp.createLoginResponse(localSp, requestInfo, 'post', { email: nameId }, {
        relayState,
        customTagReplacement: () => ({ context: responseXml(options, requestInfo.extract.request?.id ?? '', acsUrl) })
      })
      return { SAMLResponse: result.context, RelayState: relayState }
    }

    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void handleRequest().catch((error: unknown) => {
        response.destroy(error instanceof Error ? error : new Error(String(error)))
      })
      async function handleRequest() {
        try {
          const requestUrl = new URL(request.url ?? '/', origin)
          if (request.method === 'GET' && requestUrl.pathname === '/idp/sso') {
            const samlRequest = requestUrl.searchParams.get('SAMLRequest')
            assert(samlRequest, 'SP-initiated request includes SAMLRequest')
            const relayState = requestUrl.searchParams.get('RelayState') ?? undefined
            assert(localIdp && localSp, 'local SAML entities are initialized')
            const requestInfo = await localIdp.parseLoginRequest(localSp, 'redirect', { query: { SAMLRequest: samlRequest } })
            sendJson(response, await makeResponse(requestInfo, relayState, nextResponse))
            nextResponse = {}
            return
          }
          if (request.method === 'GET' && requestUrl.pathname === '/idp/unsolicited') {
            sendJson(response, await makeResponse({ extract: { request: { id: '' } } }, undefined, { omitInResponseTo: true }))
            return
          }
          sendJson(response, { error: 'not found' }, 404)
        } catch (error) {
          sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500)
        }
      }
    })
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(0, '127.0.0.1', resolve)
    })
    serverListening = true
    const address = server.address()
    assert(address && typeof address === 'object', 'local IdP has a TCP address')
    origin = `http://127.0.0.1:${address.port}`
    acsUrl = `${origin}${apiPath}/sso/saml2/sp/acs/${providerId}`
    const localSp: SamlEntity = saml.ServiceProvider({
      entityID: spEntityId,
      assertionConsumerService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: acsUrl }],
      wantAssertionsSigned: true
    })
    const localIdp: SamlEntity = saml.IdentityProvider({
      entityID: idpEntityId,
      singleSignOnService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', Location: `${origin}/idp/sso` }],
      privateKey,
      signingCert: certificate,
      nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress']
    })
    await writeFile(configPath, JSON.stringify([{
      providerId,
      label: 'Local signed SAML fixture',
      domain: 'example.test',
      samlConfig: {
        issuer: spEntityId,
        entryPoint: `${origin}/idp/sso`,
        cert: certificate,
        idpMetadata: { entityID: idpEntityId },
        callbackUrl: `${origin}${callbackPath}`
      }
    }]))
    Object.assign(process.env, {
      AUTH_BASE_URL: origin,
      AUTH_SECRET: 'saml-test-secret-at-least-thirty-two-characters',
      AUTH_SSO_CONFIG_FILE: configPath,
      AUTH_MAIL_TRANSPORT: 'capture',
      AUTH_TEST_MODE: 'true'
    })
    db = createDb(databaseUrl, 1)
    const auth = createAuth(db.db)
    const call = async (path: string, init: RequestInit, jar: CookieJar) => {
      const headers = new Headers(init.headers)
      headers.set('origin', origin)
      headers.set('x-auth-client-ip', rateLimitIP)
      const cookies = cookieHeader(jar)
      if (cookies) headers.set('cookie', cookies)
      const result = await auth.handler(new Request(`${origin}${apiPath}${path}`, { ...init, headers }))
      setCookies(jar, result.headers)
      return result
    }
    const startFlow = async (options: ResponseOptions = {}) => {
      await new Promise(resolve => setTimeout(resolve, 11_000))
      nextResponse = options
      const jar: CookieJar = new Map()
      const signIn = await call('/sign-in/sso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId, providerType: 'saml', callbackURL: `${origin}${callbackPath}` })
      }, jar)
      assert(signIn.ok, `SAML sign-in starts successfully (HTTP ${signIn.status})`)
      const idpResult = await fetch(SignInReplySchema.parse(await signIn.json()).url)
      assert(idpResult.ok, `local IdP accepts redirect-bound AuthnRequest (HTTP ${idpResult.status})`)
      return { jar, reply: IdpReplySchema.parse(await idpResult.json()) }
    }
    const postAcs = async (reply: IdpReply, jar: CookieJar) => call(`/sso/saml2/sp/acs/${providerId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ SAMLResponse: reply.SAMLResponse, ...(reply.RelayState ? { RelayState: reply.RelayState } : {}) }).toString()
    }, jar)
    const sessionAfter = async (jar: CookieJar): Promise<SessionSnapshot> => {
      const response = await call('/get-session', { method: 'GET' }, jar)
      assert(response.ok, `get-session succeeds (HTTP ${response.status})`)
      return SessionSnapshotSchema.parse(await response.json())
    }
    const expectRejected = async (label: string, reply: IdpReply, jar: CookieJar) => {
      const response = await postAcs(reply, jar)
      const location = response.headers.get('location') ?? ''
      assert(response.status >= 300 && response.status < 400, `${label} is rejected with a redirect (HTTP ${response.status})`)
      assert(location, `${label} rejection has a redirect location`)
      assert(new URL(location).searchParams.get('error'), `${label} rejection identifies an error`)
      assert(!(await sessionAfter(jar))?.session, `${label} does not create a session`)
      consola.success(`${label} is refused without a session.`)
    }

    const first = await startFlow()
    const firstAcs = await postAcs(first.reply, first.jar)
    assert(firstAcs.status >= 300 && firstAcs.status < 400, `signed response completes with redirect (HTTP ${firstAcs.status})`)
    const firstSession = await sessionAfter(first.jar)
    const firstSessionId = firstSession?.session?.id
    const firstUserId = firstSession?.user?.id
    assert(firstSessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(firstSessionId), 'signed response creates a UUID session')
    assert(firstUserId, 'signed response creates a user')
    const firstXml = Buffer.from(first.reply.SAMLResponse, 'base64').toString('utf8')
    const assertionId = firstXml.match(/<saml:Assertion[^>]*\bID="([^"]+)"/)?.[1]
    assert(assertionId, 'signed response contains an assertion ID for replay coverage')
    consola.success('Signed SP-initiated SAML response creates a UUID session.')

    const stable = await startFlow()
    const stableAcs = await postAcs(stable.reply, stable.jar)
    assert(stableAcs.status >= 300 && stableAcs.status < 400, `repeat NameID completes with redirect (HTTP ${stableAcs.status})`)
    assert((await sessionAfter(stable.jar))?.user?.id === firstUserId, 'stable NameID resolves to the same user')
    consola.success('Stable SAML NameID resolves to the same user.')

    const tampered = await startFlow()
    const tamperedXml = Buffer.from(tampered.reply.SAMLResponse, 'base64').toString('utf8')
    assert(tamperedXml.includes(nameId), 'response has a NameID to tamper')
    tampered.reply.SAMLResponse = Buffer.from(tamperedXml.replace(nameId, `tampered-${nameId}`)).toString('base64')
    await expectRejected('Tampered signed assertion', tampered.reply, tampered.jar)

    const replay = await startFlow({ assertionId })
    await expectRejected('Replayed assertion ID', replay.reply, replay.jar)

    const wrongAudience = await startFlow({ audience: `urn:saml:other-sp:${providerId}` })
    await expectRejected('Wrong audience', wrongAudience.reply, wrongAudience.jar)

    const expired = await startFlow({ notBefore: xmlDate(-15 * 60_000), notOnOrAfter: xmlDate(-10 * 60_000) })
    await expectRejected('Expired assertion', expired.reply, expired.jar)

    const unsolicitedIdp = await fetch(`${origin}/idp/unsolicited`)
    assert(unsolicitedIdp.ok, `local IdP emits unsolicited signed response (HTTP ${unsolicitedIdp.status})`)
    await expectRejected('Unsolicited IdP-initiated response', IdpReplySchema.parse(await unsolicitedIdp.json()), new Map())
  } finally {
    if (db) {
      await db.db.delete(tables.rateLimits).where(like(tables.rateLimits.key, `${rateLimitIP}|%`))
      await db.db.delete(tables.verifications).where(like(tables.verifications.value, `%${runId}%`))
      await db.db.delete(tables.users).where(like(tables.users.email, `${providerId}@%`))
      await db.close()
    }
    if (serverListening && server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    await rm(temporaryDirectory, { recursive: true, force: true })
    restoreEnvironment(environment)
  }
}

main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
