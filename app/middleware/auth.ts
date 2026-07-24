/**
 * Route middleware for pages that require a signed-in user.
 * Opt in per page:
 *
 *   definePageMeta({ middleware: 'auth' })
 *
 * This guards the *page*; it is not a security boundary. Every API route
 * still calls `requireUserSession(event)` on its own, because a client can
 * always call the API directly without ever loading the page.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
