/**
 * GET /api/posts — list posts, newest first.
 *
 * Unauthenticated callers only ever see published posts. A signed-in user
 * additionally sees their own drafts.
 */
import { postListQuerySchema } from '#shared/schemas/post'
import type { Paginated, PostWithAuthor } from '#shared/types/api'
import { and, count, desc, eq, or } from 'drizzle-orm'

export default defineEventHandler(async (event): Promise<Paginated<PostWithAuthor>> => {
  const { limit, offset, published } = validateQuery(event, postListQuerySchema)
  const session = await getUserSession(event)
  const viewerId = session.user?.id
  const db = useDb()

  // Visibility first, then the optional caller filter. Both must hold, so a
  // caller asking for `published=false` still cannot see other people's drafts.
  const visible = viewerId
    ? or(eq(tables.posts.published, true), eq(tables.posts.authorId, viewerId))
    : eq(tables.posts.published, true)

  const where = published === undefined
    ? visible
    : and(visible, eq(tables.posts.published, published))

  const [rows, [totals]] = await Promise.all([
    db.query.posts.findMany({
      where,
      limit,
      offset,
      orderBy: desc(tables.posts.createdAt),
      with: { author: true }
    }),
    db.select({ value: count() }).from(tables.posts).where(where)
  ])

  return {
    items: rows.map(toPostWithAuthor),
    total: totals?.value ?? 0,
    limit,
    offset
  }
})
