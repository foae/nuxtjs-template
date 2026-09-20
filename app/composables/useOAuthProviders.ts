/**
 * Publicly configured external sign-in providers.
 *
 * Nuxt serializes `useFetch` data into the payload, so this is rendered on
 * the server for a direct /login visit and reused on hydration without a
 * second request.
 */
export interface OAuthProviders {
  google: boolean
  github: boolean
  enterprise: Array<{ id: string, label: string }>
}

function emptyProviders(): OAuthProviders {
  return { google: false, github: false, enterprise: [] }
}

export function useOAuthProviders() {
  return useFetch<OAuthProviders>('/api/auth/providers', {
    key: 'auth-providers',
    default: emptyProviders
  })
}
