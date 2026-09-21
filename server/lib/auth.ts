import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { runWithTransaction } from '@better-auth/core/context'
import type { DBTransactionAdapter } from '@better-auth/core/db/adapter'
import { BASE_ERROR_CODES } from '@better-auth/core/error'
import { sso, deriveSAMLIdentityProviderEntityID, DiscoveryError, type SSOOptions } from '@better-auth/sso'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware, createAuthEndpoint, resetPassword, APIError } from 'better-auth/api'
import { lt } from 'drizzle-orm'
import { z } from 'zod'
import { registerSchema } from '../../shared/schemas/auth'
import type { Db } from '../database/client'
import * as tables from '../database/schema'
import { logger, redact, scrubErrorInPlace } from '../utils/logger'
import { isUniqueViolation } from '../utils/pg'
import { sendAuthEmail, validateAuthMailConfig } from './auth-mail'

type StaticProvider = NonNullable<SSOOptions['defaultSSO']>[number]
type EnterpriseProvider = StaticProvider & {
  label: string
  oidcConfig?: NonNullable<StaticProvider['oidcConfig']> & { skipDiscovery?: boolean }
}

let configuration: ReturnType<typeof loadAuthConfiguration> | undefined
// Reuse the pinned plugin's protocol schemas; static records must never contain
// persisted IDs, organization bindings or arbitrary extra properties.
const protocolSchemas = sso().endpoints.registerSSOProvider.options.body.shape
const oidcProtocolSchema: unknown = protocolSchemas.oidcConfig?.unwrap()
const samlProtocolSchema: unknown = protocolSchemas.samlConfig?.unwrap()
if (!(oidcProtocolSchema instanceof z.ZodObject) || !(samlProtocolSchema instanceof z.ZodObject)) {
  throw new Error('Pinned SSO protocol schemas are unavailable')
}
const providerSchema = z.strictObject({
  providerId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  oidcConfig: oidcProtocolSchema.extend({
    issuer: z.url(),
    discoveryEndpoint: z.url().optional(),
    clientId: z.string().min(1),
    pkce: z.boolean().default(true),
    allowIdpInitiated: z.boolean().optional()
  }).strict().optional(),
  samlConfig: samlProtocolSchema.extend({
    issuer: z.string().min(1)
  }).strict().optional(),
  privateKey: z.strictObject({
    privateKeyPem: z.string().min(1).optional(),
    privateKeyJwk: z.record(z.string(), z.unknown()).optional()
  }).optional()
})

function transportURL(value: string, requireHTTPS: boolean): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('SSO transport endpoints require valid absolute URLs')
  }
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol) || (requireHTTPS && url.protocol !== 'https:')) {
    throw new Error('SSO transport endpoints require HTTP(S), HTTPS in production, and no credentials or fragments')
  }
  return url
}

function loadAuthConfiguration() {
  const baseURL = process.env.AUTH_BASE_URL
  const secret = process.env.AUTH_SECRET
  if (!baseURL || !secret || secret.length < 32) throw new Error('Set AUTH_BASE_URL and a random AUTH_SECRET of at least 32 characters')
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    throw new Error('AUTH_BASE_URL must be a valid absolute HTTP(S) origin')
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
  if (url.origin !== baseURL || url.username || url.password) throw new Error('AUTH_BASE_URL must be an origin without path or credentials')
  const testMode = process.env.AUTH_TEST_MODE === 'true'
  if (testMode && !loopback) throw new Error('AUTH_TEST_MODE requires a loopback AUTH_BASE_URL')
  if (process.env.NODE_ENV === 'production' && !testMode && url.protocol !== 'https:') throw new Error('Production AUTH_BASE_URL requires HTTPS')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('AUTH_BASE_URL requires HTTP(S)')
  let input: unknown = []
  if (process.env.AUTH_SSO_CONFIG_FILE) {
    try {
      input = JSON.parse(readFileSync(process.env.AUTH_SSO_CONFIG_FILE, 'utf8'))
    } catch {
      throw new Error('AUTH_SSO_CONFIG_FILE must name a readable file containing valid JSON')
    }
  }
  const parsed = z.array(providerSchema).safeParse(input)
  if (!parsed.success) throw new Error(`Invalid AUTH_SSO_CONFIG_FILE: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  const providers = parsed.data as EnterpriseProvider[]
  const ids = new Set(['credential', 'google', 'github'])
  const requireHTTPS = process.env.NODE_ENV === 'production' && !testMode
  const oidcOrigins = new Map<string, Set<string>>()
  const trustedProxyIPs = (process.env.AUTH_TRUSTED_PROXY_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean)
  if (trustedProxyIPs.some(ip => !isIP(ip))) throw new Error('AUTH_TRUSTED_PROXY_IPS requires comma-separated literal IP addresses')
  for (const provider of providers) {
    if (!provider.providerId || !/^[a-zA-Z0-9_-]+$/.test(provider.providerId) || ids.has(provider.providerId) || !provider.label || !provider.domain || Boolean(provider.oidcConfig) === Boolean(provider.samlConfig)) throw new Error('Each SSO provider requires a unique providerId, label, domain and exactly one protocol configuration')
    ids.add(provider.providerId)
    if (provider.oidcConfig) {
      provider.oidcConfig.pkce = true
      const oidc = provider.oidcConfig
      if (oidc.skipDiscovery && (!oidc.authorizationEndpoint || !oidc.tokenEndpoint || !oidc.jwksEndpoint)) {
        throw new Error('OIDC skipDiscovery requires authorizationEndpoint, tokenEndpoint and jwksEndpoint')
      }
      if (oidc.tokenEndpointAuthentication === 'private_key_jwt') {
        if (!provider.privateKey?.privateKeyPem && !provider.privateKey?.privateKeyJwk) throw new Error('OIDC private_key_jwt requires an operator private key')
      } else if (!oidc.clientSecret?.trim()) throw new Error('OIDC requires a nonempty client secret')
      const origins = new Set<string>()
      for (const endpoint of [oidc.issuer, oidc.discoveryEndpoint, oidc.authorizationEndpoint, oidc.tokenEndpoint, oidc.userInfoEndpoint, oidc.jwksEndpoint]) {
        if (endpoint) origins.add(transportURL(endpoint, requireHTTPS).origin)
      }
      oidcOrigins.set(provider.providerId, origins)
    }
    if (provider.samlConfig) {
      const saml = provider.samlConfig
      saml.wantAssertionsSigned = true
      const validateEndpoint = (endpoint: string) => {
        transportURL(endpoint, requireHTTPS)
      }
      validateEndpoint(saml.entryPoint)
      if (saml.callbackUrl) validateEndpoint(saml.callbackUrl)
      for (const service of [...(saml.idpMetadata?.singleSignOnService ?? []), ...(saml.idpMetadata?.singleLogoutService ?? [])]) {
        if (service.Location) validateEndpoint(service.Location)
      }
      if (!saml.idpMetadata?.metadata && !saml.idpMetadata?.cert && !saml.cert) throw new Error('SAML requires signing certificates or IdP metadata')
      deriveSAMLIdentityProviderEntityID(saml, validateEndpoint)
    }
  }
  validateAuthMailConfig()
  const googleId = process.env.AUTH_GOOGLE_CLIENT_ID
  const googleSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET
  const githubId = process.env.AUTH_GITHUB_CLIENT_ID
  const githubSecret = process.env.AUTH_GITHUB_CLIENT_SECRET
  if (Boolean(googleId) !== Boolean(googleSecret) || Boolean(githubId) !== Boolean(githubSecret)) throw new Error('Social providers require both client ID and secret')
  const isTrustedOIDCEndpoint = (providerId: string, endpoint: string): boolean => {
    try {
      return oidcOrigins.get(providerId)?.has(transportURL(endpoint, requireHTTPS).origin) ?? false
    } catch {
      // False permits public endpoints upstream; transport rejection must throw.
      throw new DiscoveryError('discovery_invalid_url', 'OIDC endpoint violates the configured transport policy')
    }
  }
  return { baseURL, secret, providers, testMode, trustedOrigins: [baseURL], isTrustedOIDCEndpoint, trustedProxyIPs, googleId, googleSecret, githubId, githubSecret }
}

export function authConfiguration() {
  configuration ??= loadAuthConfiguration()
  return configuration
}

// Preserve the constraint identity before upstream turns all create failures into
// FAILED_TO_CREATE_USER. Apply this inside transactions too, where sign-up writes.
function withUserConflictErrors(adapter: DBTransactionAdapter): DBTransactionAdapter {
  return {
    ...adapter,
    create: <T extends Record<string, unknown>, R = T>(data: Parameters<typeof adapter.create<T, R>>[0]) => adapter.create<T, R>(data).catch((error: unknown) => {
      if (data.model === 'user' && isUniqueViolation(error, 'users_email_key')) {
        throw APIError.from('UNPROCESSABLE_ENTITY', BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)
      }
      throw error
    })
  }
}

export function createAuth(db: Db) {
  const config = authConfiguration()
  const { googleId, googleSecret, githubId, githubSecret } = config
  let nextRateLimitCleanup = 0
  const adapter = drizzleAdapter(db, {
    provider: 'pg',
    // Recovery atomicity depends on a real transaction; do not disable this.
    transaction: true,
    schema: { user: tables.users, session: tables.sessions, account: tables.accounts, verification: tables.verifications, rateLimit: tables.rateLimits, ssoProvider: tables.ssoProviders }
  })
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    logger: {
      log: (level, message, ...args) => {
        for (const arg of args) scrubErrorInPlace(arg)
        logger[level === 'warn' ? 'warn' : level === 'error' ? 'error' : level === 'debug' ? 'debug' : 'info'](redact(message), ...redact(args))
      }
    },
    // better-call also prints unexpected errors after invoking this hook.
    onAPIError: {
      onError: (error) => {
        scrubErrorInPlace(error)
        logger.error(redact(error))
      }
    },
    database: (options: Parameters<typeof adapter>[0]): ReturnType<typeof adapter> => {
      const database = adapter(options)
      return {
        ...withUserConflictErrors(database),
        transaction: callback => database.transaction(transaction => callback(withUserConflictErrors(transaction)))
      }
    },
    user: { fields: { image: 'avatarUrl' } },
    advanced: {
      // Keep normal IDs as UUIDs without rewriting SAML's deterministic replay keys.
      database: { generateId: () => randomUUID() },
      useSecureCookies: config.baseURL.startsWith('https:'),
      ipAddress: { ipAddressHeaders: ['x-auth-client-ip'] }
    },
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: false } },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    verification: { storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 200,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAuthEmail({ to: user.email, kind: 'password-reset', url })
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
      beforeEmailVerification: async (user, request): Promise<void> => {
        const session = request ? await getAuth(db).api.getSession({ headers: request.headers }) : null
        if (!session || session.user.id !== user.id) throw new APIError('FORBIDDEN', { code: 'EMAIL_VERIFICATION_SESSION_REQUIRED', message: 'Confirm from the browser where you signed in, or reset your password first.' })
      },
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail({ to: user.email, kind: 'verification', url })
    },
    socialProviders: {
      ...(googleId && googleSecret ? { google: { clientId: googleId, clientSecret: googleSecret } } : {}),
      ...(githubId && githubSecret ? { github: { clientId: githubId, clientSecret: githubSecret } } : {})
    },
    // Session reads run during every SSR render; never put visitors in one internal bucket.
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: { '/get-session': false } },
    disabledPaths: ['/sso/register', '/sso/update-provider', '/sso/delete-provider', '/sso/request-domain-verification', '/sso/verify-domain', '/sso/providers', '/sso/get-provider', '/link-social', '/unlink-account', '/change-email', '/delete-user', '/get-access-token', '/refresh-token', '/account-info', '/list-accounts', '/update-user'],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        let registration: ReturnType<typeof registerSchema.parse> | undefined
        if (ctx.path === '/sign-up/email') {
          const parsed = registerSchema.safeParse(ctx.body)
          if (!parsed.success) {
            const errors: Record<string, string> = {}
            for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message
            throw new APIError('UNPROCESSABLE_ENTITY', { message: 'Check the registration fields.', errors })
          }
          registration = parsed.data
        }
        if (ctx.path === '/send-verification-email') {
          const session = ctx.headers ? await getAuth(db).api.getSession({ headers: ctx.headers }) : null
          if (!session || session.user.email.toLowerCase() !== String(ctx.body?.email ?? '').toLowerCase()) {
            throw new APIError('UNAUTHORIZED', { code: 'EMAIL_VERIFICATION_SESSION_REQUIRED', message: 'Sign in in this browser before requesting a verification email.' })
          }
        }
        if (ctx.path === '/sign-in/sso' && !config.providers.some(p => p.providerId === ctx.body?.providerId)) throw new APIError('BAD_REQUEST', { message: 'Choose a configured enterprise provider' })
        // All configured windows are at most 60 seconds. An hour leaves ample
        // margin for active requests; predicate evaluation protects concurrent updates.
        if (Date.now() >= nextRateLimitCleanup) {
          nextRateLimitCleanup = Date.now() + 60 * 60 * 1000
          await db.delete(tables.rateLimits).where(lt(tables.rateLimits.lastRequest, Date.now() - 60 * 60 * 1000)).catch((error: unknown) => {
            scrubErrorInPlace(error)
            logger.error('Authentication rate-limit cleanup failed', redact(error))
          })
        }
        if (registration) return { context: { body: registration } }
      })
    },
    plugins: [{
      id: 'atomic-password-reset',
      endpoints: {
        resetPassword: createAuthEndpoint(resetPassword.path, resetPassword.options, ctx =>
          // Do not convert errors to HTTP responses until the transaction has rolled back.
          // Pinned 1.7.5 emits neither cookies nor status here; recheck on upgrade.
          runWithTransaction(ctx.context.adapter, () => resetPassword({ ...ctx, asResponse: false, returnHeaders: false, returnStatus: false })))
      }
    }, sso({
      defaultSSO: config.providers,
      isTrustedOIDCEndpoint: config.isTrustedOIDCEndpoint,
      providersLimit: 0,
      organizationProvisioning: { disabled: true },
      resolveUser: input => input.providerReference.source.type === 'configured'
        ? { action: 'continue' }
        : { action: 'reject', code: 'OPERATOR_PROVIDER_REQUIRED' },
      saml: {
        requireTimestamps: true,
        enableInResponseToValidation: true,
        allowIdpInitiated: false,
        algorithms: { onDeprecated: 'reject' }
      }
    })]
  })
}

let instance: ReturnType<typeof createAuth> | undefined

export function getAuth(db: Db): ReturnType<typeof createAuth> {
  instance ??= createAuth(db)
  return instance
}
