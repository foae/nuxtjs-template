/**
 * GET /auth/google — one-click sign-in.
 *
 * Lives in `server/routes/`, not `server/api/`, so the provider callback URL
 * is `/auth/google` with no `/api` prefix.
 */
interface GoogleUser {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

const handler = defineOAuthGoogleEventHandler({
  config: { scope: ['email', 'profile'] },

  async onSuccess(event, { user }: { user: GoogleUser }) {
    const email = user.email ?? ''
    const row = await upsertOAuthUser({
      email,
      emailVerified: user.email_verified === true,
      name: user.name || email.split('@')[0] || 'User',
      avatarUrl: user.picture ?? null
    })

    await signInUser(event, row)
    logger.info('user signed in via google', { userId: row.id })
    return sendRedirect(event, consumeOAuthRedirect(event))
  },

  onError(event, error) {
    logger.warn('google oauth failed', { message: error.message })
    return sendRedirect(event, '/login?error=oauth')
  }
})

// `rememberOAuthRedirect` has to run before the handler redirects to Google,
// so it wraps rather than living inside `onSuccess`.
export default defineEventHandler(async (event) => {
  rememberOAuthRedirect(event)
  return handler(event)
})
