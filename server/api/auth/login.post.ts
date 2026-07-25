/**
 * POST /api/auth/login
 *
 * Password auth is the template default because it needs no external
 * credentials. To use OAuth instead, replace this handler with
 * `defineOAuthGitHubEventHandler` (nuxt-auth-utils ships 40+ providers) and
 * drop the `passwordHash` column.
 */
import { credentialsSchema } from '#shared/schemas/auth'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email, password } = await validateBody(event, credentialsSchema)

  // See server/utils/rate-limit.ts — this counts only FAILED attempts, so
  // retyping a password a few times doesn't lock a legitimate user out.
  const key = `${clientKey(event)}:${email}`
  enforceRateLimit({ name: 'login-failures', key, limit: 5, windowMs: 15 * 60_000 })

  const user = await useDb().query.users.findFirst({
    where: eq(tables.users.email, email)
  })

  // One generic message for "no such user" and "wrong password" — a
  // distinct error would let an attacker enumerate registered addresses.
  const invalid = () => {
    recordRateLimitHit('login-failures', key)
    return createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
      data: { errors: { password: 'Email or password is incorrect' } }
    })
  }

  if (!user?.passwordHash) throw invalid()
  if (!(await verifyPassword(user.passwordHash, password))) throw invalid()

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl
    },
    loggedInAt: new Date().toISOString()
  })

  logger.info('user logged in', { userId: user.id })
  return { ok: true }
})
