/**
 * POST /api/auth/register — create an account and sign in immediately.
 */
import { registerSchema } from '#shared/schemas/auth'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email, name, password } = await validateBody(event, registerSchema)

  // See server/utils/rate-limit.ts — all attempts count here (not just
  // failures), since there is no notion of a "wrong" registration attempt.
  enforceRateLimit({ name: 'register', key: clientKey(event), limit: 10, windowMs: 10 * 60_000 })
  recordRateLimitHit('register', clientKey(event))

  const db = useDb()

  const emailTaken = () => createError({
    statusCode: 409,
    statusMessage: 'Email already registered',
    data: { errors: { email: 'That email is already registered' } }
  })

  const existing = await db.query.users.findFirst({
    where: eq(tables.users.email, email),
    columns: { id: true }
  })
  if (existing) throw emailTaken()

  // The SELECT above cannot prevent a concurrent request from inserting the
  // same email between the check and this insert. If that happens, the
  // insert itself violates users_email_key — catch it and throw the same 409
  // rather than letting it surface as an unhandled 500 (which would also log
  // the raw drizzle error, scrypt hash and all).
  const user = await db
    .insert(tables.users)
    .values({ email, name, passwordHash: await hashPassword(password) })
    .returning({
      id: tables.users.id,
      email: tables.users.email,
      name: tables.users.name,
      avatarUrl: tables.users.avatarUrl
    })
    .then(rows => rows[0])
    .catch((error: unknown) => {
      if (isUniqueViolation(error, 'users_email_key')) throw emailTaken()
      throw error
    })

  if (!user) throw createError({ statusCode: 500, statusMessage: 'Insert returned no row' })

  // Fields written out here rather than passing `user` through: the stored
  // session shape is checked by tests/unit/session-shape.test.ts, which reads
  // this call as text and cannot see through a shorthand. Keeping the shape
  // legible at the call site is also how you notice you are about to seal a
  // column like `passwordHash` into a cookie.
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl
    },
    loggedInAt: new Date().toISOString()
  })
  logger.info('user registered', { userId: user.id })
  setResponseStatus(event, 201)
  return { ok: true }
})
