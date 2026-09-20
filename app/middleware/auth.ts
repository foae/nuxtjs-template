/**
 * Route middleware for pages that require a signed-in user.
 *
 * The auth-session plugin resolves the Better Auth session before SSR renders
 * this guard and restores it from the payload on hydration. API handlers still
 * authorize every request independently.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { fetch, loggedIn } = useAuthSession()
  const nuxtApp = useNuxtApp()

  // The global refresh covers public routes; await here so a revoked session
  // cannot enter a protected route before that refresh settles.
  if (import.meta.client && !(nuxtApp.isHydrating && nuxtApp.payload.serverRendered)) {
    try {
      await fetch()
    } catch {
      // `fetch` has already cleared stale client state.
    }
  }

  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
