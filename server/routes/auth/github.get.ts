/**
 * GET /auth/github — one-click sign-in.
 *
 * Lives in `server/routes/`, not `server/api/`, so the provider callback URL
 * is `/auth/github` with no `/api` prefix.
 */
const handler = defineOAuthGitHubEventHandler({
  config: { emailRequired: true },

  // `user` is typed by the module here (unlike the Google handler, whose
  // profile shape it leaves untyped), so no local interface is needed.
  async onSuccess(event, { user }) {
    const row = await upsertOAuthUser({
      email: user.email ?? '',
      // `email_verified` is only set when the module fetched /user/emails
      // (`emailRequired`). An email taken from the public profile carries no
      // verification claim, so an absent flag means NOT verified.
      emailVerified: user.email_verified === true,
      name: user.name || user.login || 'User',
      avatarUrl: user.avatar_url ?? null
    })

    await signInUser(event, row)
    logger.info('user signed in via github', { userId: row.id })
    return sendRedirect(event, consumeOAuthRedirect(event))
  },

  onError(event, error) {
    logger.warn('github oauth failed', { message: error.message })
    return sendRedirect(event, '/login?error=oauth')
  }
})

// `rememberOAuthRedirect` has to run before the handler redirects to GitHub,
// so it wraps rather than living inside `onSuccess`.
export default defineEventHandler(async (event) => {
  rememberOAuthRedirect(event)
  return handler(event)
})
