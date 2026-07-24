# Agent-first Nuxt 4 template

Server-rendered Nuxt 4 + Postgres starter, optimised for being *written by a
coding agent* with a human reviewing.

```bash
cp .env.example .env          # set NUXT_SESSION_PASSWORD
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

Seeded logins: `ada@example.com` / `grace@example.com`, password
`correct-horse-battery-staple`.

Agent instructions live in [`CLAUDE.md`](./CLAUDE.md).

## Stack

| Layer | Choice | Why this one |
|---|---|---|
| Framework | Nuxt 4.5, universal SSR | Pages render from Postgres per request |
| UI | Nuxt UI v4 + Tailwind v4 | 125+ components, and a **first-party agent skill** |
| Database | Postgres 18 + Drizzle | Schema is plain TypeScript — real types via LSP, no opaque generated client; migrations are readable SQL |
| Validation | Zod 4 in `shared/` | One schema drives server validation *and* the UI form |
| Auth | nuxt-auth-utils | Sealed-cookie sessions, no codegen step to forget |
| Tests | Vitest + Playwright | Unit ~1s; e2e covers the flows units can't reach |
| Deploy | Nitro `node-server` + Docker | No vendor lock-in, no edge-runtime caveats |

## What makes it agent-first

Choosing "LLM-friendly" libraries is the easy half, and the least important.
What actually matters is that mistakes get *caught mechanically*:

- **`pnpm verify`** — one command, ~20s, no database required: typecheck, lint,
  unit tests, and a migration-freshness check. CI runs the same command.
- **Migration-freshness check** — editing `schema.ts` without generating a
  migration still typechecks, so it would otherwise surface at deploy time.
  `verify` generates the migration and fails, telling you to review and commit.
- **Schema-drift test** — convention-driven, so it covers new resources for
  free: it discovers every `*CreateSchema` and checks it against its table.
  Renaming a column fails a test, and adding a table with no wire contract
  fails until you write one or record why it doesn't need one.
- **Session-shape test** — the hand-written session type augmentation is
  checked against what `setUserSession()` actually stores.
- **`pnpm db:reset`** — restores a deterministic database state unattended, so
  an agent can verify data-dependent work without a human in the loop.
- **`.logs/dev-errors.jsonl`** — runtime errors as greppable JSON, so an agent
  reads its own failures instead of asking for a pasted stack trace.
- **Vendored, version-pinned docs** — `pnpm docs:sync` mirrors the Nuxt docs
  from the git tag matching your *installed* Nuxt, so they cannot drift ahead
  of your lockfile. `pnpm skills:sync` does the same for the Nuxt UI skill.
- **No MCP servers.** Component APIs are read from `node_modules` (~500 tokens
  per component, version-exact) rather than a docs page (~7K tokens, tracks
  latest). Nothing sits resident in context every session.

## Layout

```
app/          Vue app — pages, components, composables, middleware
server/
  api/        HTTP handlers
  database/   Drizzle schema, migrations, connection factory
  utils/      auto-imported server helpers (db, logger, validate)
  plugins/    Nitro plugins (error logging)
shared/       imported by BOTH app and server — schemas, types
docs/vendor/  vendored Nuxt docs, version-pinned (pnpm docs:sync)
.claude/      vendored agent skills (pnpm skills:sync)
scripts/      seed, reset, verify, sync
tests/        unit (fast, no DB) and e2e (Playwright)
```

## Deploying

```bash
docker build -t app .
docker run -p 3000:3000 -e DATABASE_URL=... -e NUXT_SESSION_PASSWORD=... app
```

Run `pnpm db:migrate` as a separate deploy step — the container deliberately
does not migrate on boot, which would race across replicas.

## Licence

MIT. Vendored Nuxt documentation under `docs/vendor/nuxt/` is MIT, © Nuxt team.
