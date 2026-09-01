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

Deliberately **not** included: `@nuxt/image`, `@nuxtjs/seo`, `@vueuse/nuxt` —
a minimal template shouldn't ship modules its reference app never exercises.
The "Deliberately not installed" table in [`CLAUDE.md`](./CLAUDE.md) names the
exact package to reach for when each need becomes real.

## What makes it agent-first

Choosing "LLM-friendly" libraries is the easy half, and the least important.
What actually matters is that mistakes get *caught mechanically*:

- **`pnpm verify`** — one command, ~35s, no database required: typecheck, lint,
  unit tests, a migration-freshness check, and a vendored-docs-pinned check.
  CI runs the same command.
- **TypeScript only, and type-aware linting where it pays.** `allowJs` is off in
  all four type contexts, so a stray `.js` cannot slip in. `no-floating-promises`
  catches a forgotten `await` on a database write — a silent no-op that
  `typecheck` accepts and that returns 200 having written nothing.
- **Migration-freshness check** — editing `schema.ts` without generating a
  migration still typechecks, so it would otherwise surface at deploy time.
  `verify` generates the migration and fails, telling you to review and commit.
- **Schema-drift test** — convention-driven, so it covers new resources for
  free: it discovers every `*CreateSchema` and checks its field names against
  its table — every field names a real column, no field is server-owned, and
  every required-without-default column is covered. It does not compare Zod
  types, nullability, or refinements, so it's a name-level check, not a type
  check. Renaming a column fails a test, and adding a table with no wire
  contract fails until you write one or record why it doesn't need one.
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
- **Harness-agnostic, not Claude-specific.** Skills live in `.agents/skills/` —
  the vendor-neutral [Agent Skills](https://agentskills.io) location that pi and
  OpenCode load natively — with `.claude/skills` symlinked there for Claude
  Code. One copy, three harnesses, nothing to drift.

## Layout

```
app/          Vue app — pages, components, composables, middleware
server/
  api/        HTTP handlers
  database/   Drizzle schema, migrations, connection factory
  utils/      auto-imported server helpers (db, logger, validate)
  plugins/    Nitro plugins (error logging, security headers)
shared/       imported by BOTH app and server — schemas, types
docs/vendor/  vendored Nuxt docs, version-pinned (pnpm docs:sync)
.agents/      agent skills, harness-agnostic — nuxt-page is hand-written,
  skills/     nuxt-ui is vendored (pnpm skills:sync). Generated files say so
              in their own header. .claude/skills symlinks here.
scripts/      seed, reset, verify, sync
tests/        unit (fast, no DB) and e2e (Playwright)
```

## Deploying

```bash
# 1. Run migrations as a separate step, before rolling out the app image.
docker build --target migrate -t app-migrate .
docker run --rm -e DATABASE_URL=... app-migrate

# 2. Build and run the app image.
docker build -t app .
docker run -p 3000:3000 -e DATABASE_URL=... -e NUXT_SESSION_PASSWORD=... app
```

The container deliberately does not migrate on boot — that would race when
more than one replica boots — so migrations run from the `migrate` target,
which reuses the build stage's devDependencies and drizzle-kit instead of
shipping them in the runtime image.

### Security headers: what the app sets vs. what your proxy must set

The app serves a conservative baseline itself (`nuxt.config.ts` route rules):
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` — and strips the `X-Powered-By` fingerprint. Two headers
are deliberately left to the reverse proxy / ingress, because they depend on
deployment facts a template cannot know:

- **HSTS** — set it where TLS terminates, or it is a promise the app cannot
  keep.
- **CSP** — needs a per-project script/style inventory; a generic policy
  either breaks the app or protects nothing.

`tests/e2e/security.spec.ts` asserts the app-owned baseline, so a regression
fails CI.

### Auth scope

Email + password with sealed-cookie sessions, plus basic in-process rate
limiting on login and registration. That limiter is per-replica and resets on
restart (`server/utils/rate-limit-core.ts` documents what to replace it with
before scaling out), and there is no password reset, email verification or
session revocation — `CLAUDE.md` lists the exact boundaries before you build
on it.

## Licence

MIT. Vendored Nuxt documentation under `docs/vendor/nuxt/` is MIT, © Nuxt team.
