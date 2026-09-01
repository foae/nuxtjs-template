/**
 * Which one-click providers are configured.
 *
 * Resolved during SSR from the PRIVATE runtime config — booleans only, never
 * the client ids or secrets — and carried to the client in the payload via
 * `useState`, so /login renders the buttons server-side with no extra request
 * and, crucially, no async boundary: a component that awaits during SSR only
 * shifts Vue's `useId` counter, which silently breaks every `<label for=...>`
 * association on the form in a production build.
 */
export function useOAuthProviders() {
  return useState('oauth-providers', () => {
    // `app.vue` calls this during every server render, so by the time any
    // page reads it the value is already in the payload and this initializer
    // never runs in the browser. The guard is a tripwire, not a path: private
    // runtime config is empty on the client, and without it a truthiness check
    // against nothing would silently claim "no providers".
    if (import.meta.client) return { google: false, github: false }

    const oauth = useRuntimeConfig().oauth
    return {
      google: Boolean(oauth?.google?.clientId),
      github: Boolean(oauth?.github?.clientId)
    }
  })
}
