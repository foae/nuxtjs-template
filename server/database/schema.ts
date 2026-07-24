/**
 * Drizzle schema — the single source of truth for the database.
 *
 * Wire contracts in `shared/schemas/` are **hand-written, not generated**.
 * `shared/` is bundled into the browser as well as the server, so it cannot
 * import this file at runtime, which rules out deriving schemas with
 * drizzle-zod. The wire shape is also deliberately not the storage shape —
 * `authorId` comes from the session, not the client.
 *
 * The two are kept in step by `tests/unit/schema-drift.test.ts`, which
 * discovers every `*CreateSchema` and checks it against its table. Add a
 * table without a contract and that suite fails until you write one or
 * record why it doesn't need one.
 *
 * After editing, run `pnpm db:generate` to produce a migration, then
 * `pnpm db:migrate` to apply it. `pnpm verify` fails if you forget.
 *
 * Column names are snake_cased automatically (`casing: 'snake_case'`), so
 * `avatarUrl` in TypeScript is `avatar_url` in Postgres. Don't name columns by hand.
 */
import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  name: text().notNull(),
  avatarUrl: text(),
  // scrypt hash from nuxt-auth-utils' `hashPassword()` (@adonisjs/hash).
  // Nullable so an OAuth-only account can exist without one. NEVER select
  // this into an API response — see server/utils/posts.ts for the pattern.
  passwordHash: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('users_email_key').on(t.email)
])

export const posts = pgTable('posts', {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  slug: text().notNull(),
  body: text().notNull().default(''),
  published: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, t => [
  uniqueIndex('posts_slug_key').on(t.slug),
  index('posts_author_id_idx').on(t.authorId)
])

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}))

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] })
}))

/** Row types inferred from the schema — never hand-write these. */
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
