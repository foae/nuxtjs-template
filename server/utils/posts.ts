/**
 * Shared post helpers. Keeping the row -> API mapping in one place is what
 * stops an endpoint accidentally returning the author's email address.
 */
import type { PostWithAuthor } from '#shared/types/api'
import type { Post, User } from '../database/schema'

type PostRow = Post & { author: User }

/** Maps a DB row to the wire shape. The ONLY place a post becomes JSON. */
export function toPostWithAuthor(row: PostRow): PostWithAuthor {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    body: row.body,
    published: row.published,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.author.id,
      name: row.author.name,
      // Deliberately no `email` — see shared/types/api.ts PublicUser.
      avatarUrl: row.author.avatarUrl
    }
  }
}
