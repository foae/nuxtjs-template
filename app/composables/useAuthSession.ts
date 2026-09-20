export interface AuthUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
}

export interface AuthSession {
  user: AuthUser
  session: {
    id: string
    expiresAt: string
  }
}

interface AuthSessionResponse {
  user?: unknown
  session?: unknown
}

let activeClientFetch: Promise<AuthSession | null> | null = null

/** Discards credentials and request metadata returned by Better Auth. */
function projectAuthSession(result: AuthSessionResponse | null): AuthSession | null {
  const { user, session } = result ?? {}
  if (
    !user
    || typeof user !== 'object'
    || !('id' in user)
    || !('name' in user)
    || !('email' in user)
    || !('emailVerified' in user)
    || !('image' in user)
    || !session
    || typeof session !== 'object'
    || !('id' in session)
    || !('expiresAt' in session)
  ) return null

  if (
    typeof user.id !== 'string'
    || typeof user.name !== 'string'
    || typeof user.email !== 'string'
    || typeof user.emailVerified !== 'boolean'
    || (user.image !== null && typeof user.image !== 'string')
    || typeof session.id !== 'string'
    || typeof session.expiresAt !== 'string'
  ) return null

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image
    },
    session: {
      id: session.id,
      expiresAt: session.expiresAt
    }
  }
}

/**
 * The Better Auth session shared by navigation, route middleware, and pages.
 * Its `useState` backing preserves the SSR result through hydration.
 */
export function useAuthSession() {
  const session = useState<AuthSession | null>('auth-session', () => null)
  const initialized = useState<boolean>('auth-session-initialized', () => false)

  const user = computed(() => session.value?.user ?? null)
  const loggedIn = computed(() => user.value !== null)

  async function fetch() {
    if (import.meta.client && activeClientFetch) return activeClientFetch

    const requestFetch = import.meta.server ? useRequestFetch() : $fetch
    const request = requestFetch<AuthSessionResponse | null>('/api/auth/get-session')
      .then(projectAuthSession)
      .then((result) => {
        session.value = result
        initialized.value = true
        return result
      })
      .catch((error) => {
        // A failed client refresh must not leave a revoked session in memory.
        if (import.meta.client) clear()
        throw error
      })

    if (import.meta.client) {
      activeClientFetch = request
      void request.then(
        () => { activeClientFetch = null },
        () => { activeClientFetch = null }
      )
    }

    return request
  }

  function clear() {
    session.value = null
    initialized.value = true
  }

  return { user, loggedIn, fetch, clear }
}
