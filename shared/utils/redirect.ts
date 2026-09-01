/**
 * Redirect-target sanitising, shared by the login page and the OAuth routes.
 *
 * `shared/utils` is auto-imported in both the app and the server, so this file
 * must stay free of Vue and Nitro imports (rule 1).
 */

/**
 * Narrows an untrusted `?redirect=` value to a same-origin path.
 *
 * Anything that is not a string starting with a single `/` becomes `/`: a full
 * URL (`https://evil.example`) or a protocol-relative one (`//evil.example`)
 * would otherwise turn our own login flow into an open redirect.
 */
export function safeRedirectPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
