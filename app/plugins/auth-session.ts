/**
 * Initializes the Better Auth session before SSR renders routes or chrome.
 * On the client, the SSR-backed state is already hydrated; a client-only
 * application performs the initial request instead.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const { fetch } = useAuthSession()
  const initialized = useState<boolean>('auth-session-initialized', () => false)

  async function refresh() {
    try {
      await fetch()
    } catch {
      // Public routes stay available when the session endpoint is transiently unavailable.
      // `fetch` only clears client state, never server-side authorization.
    }
  }

  if (import.meta.server) {
    await refresh()
    return
  }

  // The SSR session payload already hydrated this state, so do not request it again.
  if (!initialized.value) await refresh()

  useRouter().beforeEach(async () => {
    // Reuse SSR authorization during hydration instead of delaying event binding.
    if (nuxtApp.isHydrating && nuxtApp.payload.serverRendered) return
    await refresh()
  })

  window.addEventListener('focus', () => {
    void refresh()
  })
})
