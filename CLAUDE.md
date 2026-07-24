# CLAUDE.md

Server-rendered Nuxt 4 + Postgres template, built to be worked on by coding agents.

This file is a **map, not a manual**. It tells you where things live and which
rules are not guessable. It deliberately does not restate Nuxt documentation —
that is vendored in `docs/vendor/nuxt/`, pinned to the installed version.

---

## The one rule

```bash
pnpm verify
```

Run it before you say a task is done. It is typecheck + lint + unit tests +
migration-freshness, needs no database, and takes ~20s. It is the same command
CI runs — there is no separate list of checks that can drift from this one.

If it fails, fix it. Do not report success with a failing verify.

---

## Where things go

| Task | Location |
|---|---|
| Add a page / route | `app/pages/` — file-based routing |
| Add a UI component | `app/components/` — auto-imported |
| Add a client composable | `app/composables/` — auto-imported |
| Add an API endpoint | `server/api/` — file = route, `.get.ts`/`.post.ts` = method |
| Add a server helper | `server/utils/` — **auto-imported across the server** |
| Change the database | `server/database/schema.ts`, then `pnpm db:generate` |
| Add a wire contract (validation) | `shared/schemas/` — imported by both sides |
| Add a shared type | `shared/types/` — auto-imported in app *and* server |
| Add a script | `scripts/` — run with `tsx` |
| Unit test | `tests/unit/` — fast, no DB |
| E2E test | `tests/e2e/` — needs DB + build |

The vertical slice for **posts** is the reference implementation. To add a new
resource, copy its shape end to end:

```
server/database/schema.ts     table + relations
shared/schemas/post.ts        zod contract (what crosses the wire)
shared/types/api.ts           response types (type-only import from schema)
server/utils/posts.ts         row -> API mapping (the ONLY place it becomes JSON)
server/api/posts/*.ts         handlers
app/pages/posts/*.vue         pages
tests/unit/schema-drift.test.ts   keeps contract and table aligned
```

---

## Searching this repo

`docs/vendor/nuxt/` is 235 committed markdown files. It is deliberately
committed (grep is the cheapest lookup you have, and it is version-pinned),
but it **will drown your searches** if you don't scope them:

| Term | hits in code | hits in docs |
|---|---|---|
| `useFetch` | 4 | 153 |
| `useState` | 0 | 72 |
| `navigateTo` | 4 | 57 |

**Default to scoping searches to source:**

```bash
rg "useFetch" app server shared tests scripts
```

Search `docs/vendor/nuxt/` only when you actually want framework
documentation, and search it on purpose:

```bash
rg "shared directory" docs/vendor/nuxt/
```

---

## Nuxt UI component APIs — read these, not the website

The vendored skill (`.claude/skills/nuxt-ui/`) teaches *which* component to
use. For *what a component accepts*, upstream tells you to use the Nuxt UI MCP
server. **This project ships no MCP.** Use the installed package instead — it
is version-exact and far cheaper:

| You need | Read | Cost |
|---|---|---|
| Props, slots, events | `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts` | ~500 tokens |
| Allowed `color`/`variant`/`size` | `.nuxt/ui/<name>.ts` — **first ~40 lines** | small |
| Which component, how to compose | `.claude/skills/nuxt-ui/` | — |

The equivalent page on ui.nuxt.com is ~28 KB (~7K tokens) for one component,
tracks latest rather than your installed version, and needs the network.

`.nuxt/` is generated — run `pnpm nuxt prepare` if missing. It also reflects
this project's `app/app.config.ts` theme overrides, which published docs cannot.

---

## Rules that are not guessable

These cost real debugging time. Do not "fix" them back.

1. **`shared/` cannot import Vue or Nitro code.** It is bundled into both. Use
   `import type` only when referencing `server/database/schema` from `shared/`
   — type imports are erased, value imports would ship drizzle to the browser.

2. **Session type augmentation lives in `shared/types/auth.d.ts`**, not a root
   `auth.d.ts`. Only `shared/**/*.d.ts` is included by all three generated
   tsconfigs. A root file is invisible to the **server** context, so `user.id`
   silently loses its type in `server/api/**`.

3. **Never prerender a database-backed route.** Prerendering runs at build
   time with no database. `nuxt.config.ts` has no prerender rules on purpose.
   Use `swr`/`isr` route rules if you want caching.

4. **`useFetch` at setup level, `$fetch` in event handlers.** Calling `$fetch`
   during setup fetches twice — once on the server, again on hydration.

5. **One Vue version only.** `pnpm-workspace.yaml` pins the whole `vue` family.
   Two copies in one bundle produce a blank 500 page and
   `Cannot read properties of null (reading 'ce')` — SSR HTML looks correct
   and only the client crashes, which is miserable to trace.

6. **pnpm overrides live in `pnpm-workspace.yaml`,** not `package.json`.
   pnpm 11 ignores `package.json#pnpm` with only a warning.

7. **Postgres 18 mounts at `/var/lib/postgresql`,** not `.../data`. Nearly
   every guide says `/data`; that makes the container start unhealthy.

8. **Column names are snake_cased automatically** (`casing: 'snake_case'`).
   Write `authorId` in TypeScript, get `author_id` in Postgres. Never pass
   column-name strings by hand.

9. **`authorId` comes from the session, never the request body.** The wire
   contract has no such field so a client cannot spoof authorship. Mirror this
   for any owned resource.

10. **Return 404, not 403, for another user's draft.** A 403 confirms the row
    exists. See `server/api/posts/[id].get.ts`.

11. **`runtimeConfig` is only overridden by `NUXT_`-prefixed env vars.**
    `runtimeConfig.databaseUrl` reads `NUXT_DATABASE_URL`, *not* `DATABASE_URL`.
    `server/utils/db.ts` reads `process.env.DATABASE_URL` first precisely so
    one name works everywhere. Without that, a container given only
    `DATABASE_URL` keeps the empty build-time default and postgres.js falls
    back to localhost — ECONNREFUSED inside the container while the database
    is plainly reachable. Any new runtime secret needs the same care.

---

## Debugging your own work

Unhandled server errors in dev are appended to `.logs/dev-errors.jsonl`, one
JSON object per line, with method, path, status, message, validation details
and a trimmed stack. Read it instead of asking for a pasted stack trace:

```bash
tail -5 .logs/dev-errors.jsonl | jq .
```

Secrets are redacted by `redact()` in `server/utils/logger.ts` before writing.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm verify` | **typecheck + lint + test + migration freshness** |
| `pnpm dev` | dev server |
| `pnpm db:up` / `db:down` | start / stop Postgres (Docker) |
| `pnpm db:generate` | create a migration after editing the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | deterministic seed (fixed UUIDs, see `scripts/seed.ts`) |
| `pnpm db:reset` | drop → migrate → seed, unattended |
| `pnpm test` / `test:e2e` | unit tests / Playwright |
| `pnpm docs:sync` | re-mirror Nuxt docs at the installed version |
| `pnpm skills:sync` | re-vendor the Nuxt UI skill |

Seeded logins: `ada@example.com` / `grace@example.com`, password
`correct-horse-battery-staple`.

---

## Changing the database

```bash
# 1. edit server/database/schema.ts
pnpm db:generate     # 2. writes server/database/migrations/NNNN_*.sql
pnpm db:migrate      # 3. apply
pnpm verify          # 4. catches it if you skipped step 2
```

Editing the schema without generating a migration still typechecks — the types
come straight from the schema file — so nothing complains until deploy. That is
exactly what the migration-freshness check in `pnpm verify` exists to catch.

If you change a column that a `shared/schemas/` contract references,
`tests/unit/schema-drift.test.ts` fails. That is intended: update the contract.

---

## Scope

Do not add a dependency, switch the ORM/UI/auth library, or change the
rendering mode without being asked. The stack was chosen deliberately;
`README.md` records what and why.
