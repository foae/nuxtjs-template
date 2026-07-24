/**
 * Deterministic seed. Fixed UUIDs mean tests and agent verification runs can
 * reference rows by literal id without querying for them first.
 *
 *   pnpm db:seed     # truncate seeded tables, then insert
 *   pnpm db:reset    # drop schema, re-migrate, re-seed
 */
import process from 'node:process'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { consola } from 'consola'
import { createDb } from '../server/database/client'
import { posts, users } from '../server/database/schema'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app'

/** Every seeded account uses this password. Dev only — never seed production. */
export const SEED_PASSWORD = 'correct-horse-battery-staple'

// Mirrors nuxt-auth-utils' hashPassword(): @adonisjs/hash with the Scrypt
// driver and default options. Its own helper can't be used here because it
// calls useRuntimeConfig(), which only exists inside Nitro.
const hasher = new Hash(new Scrypt({}))

/** Stable ids — referenced directly in tests. Do not renumber. */
export const SEED_IDS = {
  ada: '00000000-0000-4000-8000-000000000001',
  grace: '00000000-0000-4000-8000-000000000002',
  postHello: '00000000-0000-4000-8000-000000000101',
  postDraft: '00000000-0000-4000-8000-000000000102'
} as const

async function main() {
  const { db, close } = createDb(DATABASE_URL, 1)

  try {
    // Child first — posts references users.
    await db.delete(posts)
    await db.delete(users)

    const passwordHash = await hasher.make(SEED_PASSWORD)

    await db.insert(users).values([
      { id: SEED_IDS.ada, email: 'ada@example.com', name: 'Ada Lovelace', passwordHash },
      { id: SEED_IDS.grace, email: 'grace@example.com', name: 'Grace Hopper', passwordHash }
    ])

    await db.insert(posts).values([
      {
        id: SEED_IDS.postHello,
        authorId: SEED_IDS.ada,
        title: 'Hello world',
        slug: 'hello-world',
        body: 'The first published post.',
        published: true
      },
      {
        id: SEED_IDS.postDraft,
        authorId: SEED_IDS.grace,
        title: 'Unpublished draft',
        slug: 'unpublished-draft',
        body: 'Only the author should see this.',
        published: false
      }
    ])

    consola.success(`Seeded 2 users and 2 posts into ${redact(DATABASE_URL)}`)
  } finally {
    await close()
  }
}

function redact(url: string) {
  return url.replace(/\/\/[^@]*@/, '//***@')
}

main().catch((error) => {
  consola.error('Seed failed:', error)
  process.exit(1)
})
