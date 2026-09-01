/**
 * Shared plumbing for the OAuth sign-in routes in `server/routes/auth/`.
 *
 * **Accounts are linked by email address, and that is only safe when the
 * provider vouches for the address.** An unverified email means the provider
 * lets anyone claim it, so accepting one would hand an attacker any local
 * account with a matching address — classic account takeover. Hence the hard
 * 401 in `upsertOAuthUser()` rather than a "trust it just this once".
 *
 * Given a verified address, linking is deliberate: someone who registered with
 * a password and later clicks "Continue with Google" lands on their existing
 * account rather than a duplicate. The password stays valid; both routes in.
 */
import type { H3Event } from 'h3'
import { sql } from 'drizzle-orm'

export interface OAuthProfile {
  email: string
  emailVerified: boolean
  name: string
  avatarUrl: string | null
}

/** Finds or creates the account behind a provider profile, and returns it. */
export async function upsertOAuthUser(profile: OAuthProfile) {
  if (!profile.emailVerified) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Email not verified',
      message: 'Your provider account has no verified email address'
    })
  }

  // One statement, so a concurrent first sign-in cannot race between a SELECT
  // and an INSERT. `excluded.avatar_url` is a RAW SQL fragment: drizzle's
  // `casing: 'snake_case'` only renames columns it generates, so this one has
  // to be spelled snake_case by hand (rule 8 covers the cased side).
  // `name` is left alone on conflict — the provider must not overwrite a name
  // the user chose here.
  const row = await useDb()
    .insert(tables.users)
    .values({
      email: profile.email.toLowerCase(),
      name: profile.name,
      avatarUrl: profile.avatarUrl
    })
    .onConflictDoUpdate({
      target: tables.users.email,
      set: { avatarUrl: sql`coalesce(${tables.users.avatarUrl}, excluded.avatar_url)` }
    })
    .returning({
      id: tables.users.id,
      email: tables.users.email,
      name: tables.users.name,
      avatarUrl: tables.users.avatarUrl
    })
    .then(rows => rows[0])

  if (!row) throw createError({ statusCode: 500, statusMessage: 'Upsert returned no row' })
  return row
}

/**
 * Stashes `?redirect=` before we hand the browser to the provider.
 *
 * Only on the FIRST hop — the callback carries `?code=`, and by then the query
 * belongs to the provider, not to us.
 */
export function rememberOAuthRedirect(event: H3Event) {
  const query = getQuery(event)
  if (query.code) return

  setCookie(event, 'oauth_redirect', safeRedirectPath(query.redirect), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 600
  })
}

/** Reads the stashed path, clears the cookie, and falls back to `/`. */
export function consumeOAuthRedirect(event: H3Event): string {
  const value = getCookie(event, 'oauth_redirect')
  deleteCookie(event, 'oauth_redirect', { path: '/auth' })
  return safeRedirectPath(value)
}
