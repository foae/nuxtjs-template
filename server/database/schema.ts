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
import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  name: text().notNull(),
  avatarUrl: text(),
  emailVerified: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, t => [
  uniqueIndex('users_email_key').on(t.email)
])

export const sessions = pgTable('sessions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('sessions_token_key').on(t.token),
  index('sessions_user_id_idx').on(t.userId)
])

export const accounts = pgTable('accounts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  password: text(),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('accounts_provider_identity_key').on(t.providerId, t.accountId),
  index('accounts_user_id_idx').on(t.userId)
])

export const verifications = pgTable('verifications', {
  // Better Auth also stores deterministic, non-UUID SAML replay reservations here.
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
}, t => [index('verifications_identifier_idx').on(t.identifier)])

export const rateLimits = pgTable('rate_limits', {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: 'number' }).notNull()
}, t => [uniqueIndex('rate_limits_key_key').on(t.key)])

// Static operator configuration is authoritative. Public management is disabled.
export const ssoProviders = pgTable('sso_providers', {
  id: uuid().primaryKey().defaultRandom(),
  issuer: text().notNull(),
  oidcConfig: text(),
  samlConfig: text(),
  userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text().notNull(),
  organizationId: text(),
  domain: text().notNull()
}, t => [uniqueIndex('sso_providers_provider_id_key').on(t.providerId)])

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
  index('posts_author_id_idx').on(t.authorId),
  index('posts_published_created_at_idx').on(t.published, t.createdAt)
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
