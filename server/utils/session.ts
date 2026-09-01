/**
 * The one place a session cookie is sealed.
 *
 * Every sign-in path (password login, registration, OAuth) goes through
 * `signInUser()` so the stored shape cannot drift between handlers.
 * `tests/unit/session-shape.test.ts` reads this file as TEXT and compares the
 * `user: { ... }` literal below against `shared/types/auth.d.ts`, so the fields
 * must stay written out inline — a shorthand `{ user }` or a spread makes the
 * test blind and it fails loudly rather than passing quietly. The same test
 * also asserts no other server file calls `setUserSession(`.
 */
import type { H3Event } from 'h3'
import type { User } from '../database/schema'

export async function signInUser(
  event: H3Event,
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>
) {
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl
    },
    loggedInAt: new Date().toISOString()
  })
}
