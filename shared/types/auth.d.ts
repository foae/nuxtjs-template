/**
 * Session shape for nuxt-auth-utils.
 *
 * The module ships `interface User {}` empty on purpose — augmenting it here
 * is what makes `user.id` typed in server routes, pages and composables.
 *
 * This file lives in `shared/types/` rather than at the project root because
 * only `shared/**\/*.d.ts` is included by ALL THREE generated tsconfigs
 * (app, server, shared). A root-level `auth.d.ts` — which most guides tell
 * you to create — is picked up by app and shared but NOT by server, so
 * `user.id` would still be untyped in `server/api/**`.
 *
 * Keep this in sync with what `setUserSession()` actually stores; nothing
 * enforces that automatically.
 */
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatarUrl: string | null
  }

  interface UserSession {
    loggedInAt?: string
  }

  // Add `SecureSessionData` here if you need server-only session fields
  // (never sent to the client). Left out deliberately — an empty interface
  // would widen the type to accept any non-nullish value.
}

export {}
