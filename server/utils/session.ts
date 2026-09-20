import { createError, type H3Event } from 'h3'
import { getAuth } from '../lib/auth'

/** Database-backed sessions reflect revocation and current user state on every request. */
export async function getUserSession(event: H3Event) {
  const headers = new Headers()
  if (event.headers.get('cookie')) headers.set('cookie', event.headers.get('cookie')!)
  const result = await getAuth(useDb()).api.getSession({ headers })
  return {
    user: result
      ? {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          avatarUrl: result.user.image ?? null,
          emailVerified: result.user.emailVerified
        }
      : undefined
  }
}

export async function requireUserSession(event: H3Event) {
  const session = await getUserSession(event)
  if (!session.user) throw createError({ statusCode: 401, message: 'Sign in required' })
  return { user: session.user }
}
