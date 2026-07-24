/**
 * Response shapes crossing the wire. Auto-imported in both the Vue app and
 * the Nitro server (`shared/types/` is an auto-import directory).
 *
 * These derive from the Drizzle row types with `import type`, which is erased
 * at compile time — no server code, and no drizzle-orm, reaches the client
 * bundle. If a column is renamed in the schema, every consumer of these types
 * fails to typecheck, which is exactly the drift we want caught.
 */
import type { Post, User } from '../../server/database/schema'

/** A user as exposed publicly. Never widen this to the full row — that would
 *  leak email addresses to any client that fetches a post. */
export interface PublicUser {
  id: User['id']
  name: User['name']
  avatarUrl: User['avatarUrl']
}

/** A post as returned by the API, with its author embedded. */
export interface PostWithAuthor {
  id: Post['id']
  title: Post['title']
  slug: Post['slug']
  body: Post['body']
  published: Post['published']
  createdAt: string
  updatedAt: string
  author: PublicUser
}

export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
