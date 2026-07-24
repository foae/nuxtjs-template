import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app'
  },
  // Migration files are reviewed by a human before they run, so never
  // let drizzle-kit apply changes without generating one first.
  strict: true,
  verbose: true
})
