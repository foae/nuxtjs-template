# CLAUDE.md · AGENTS.md

Server-rendered Nuxt 4 + Postgres template, built to be worked on by coding agents.

`AGENTS.md` is a **symlink to this file**, so Codex, OpenCode, Cursor, Gemini
and Copilot read exactly what Claude Code reads and the two cannot drift.
Don't replace it with a real file: the summary that used to live there had
already gone stale (it advertised eleven non-guessable rules when there were
twelve, and four `verify` checks when there were five).

This file is a **map, not a manual**. It tells you where things live and which
rules are not guessable. It deliberately does not restate Nuxt documentation —
that is vendored in `docs/vendor/nuxt/`, pinned to the installed version — and
it hands off detailed recipes to the skills listed below rather than inlining
them.

---

## The one rule

```bash
pnpm verify
```

Run it before you say a task is done. It is typecheck + lint + unit tests +
migration-freshness + vendored-docs-pinned, needs no database, and takes ~20s.
It is the same command CI runs — there is no separate list of checks that can
drift from this one.

If it fails, fix it. Do not report success with a failing verify.

**Green verify does not mean correct.** It catches *mechanical* mistakes —
type errors, style, a forgotten migration, a contract whose field names no
longer match its table. It cannot catch a wrong rule in a handler, and it
checks no types inside a contract: `published: z.string()` passes verify and
fails in Postgres. A PATCH bug that silently wiped post bodies passed every
check and shipped; only reading the behaviour caught it. For anything touching
data, exercise the actual endpoint (`pnpm db:reset`, then curl it or write an
e2e test) before calling it done.

---

## Deeper documentation, on demand

This file stays a map. The detail lives in files you open only when the task
needs them — nothing below is worth loading speculatively:

| When you are… | Open |
|---|---|
| adding a page, route, or menu entry | `.claude/skills/nuxt-page/SKILL.md` |
| choosing or composing UI components | `.claude/skills/nuxt-ui/SKILL.md` + `references/` |
| after a component's exact props | `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts` |
| after framework behaviour (Nuxt itself) | `docs/vendor/nuxt/` — 235 files, **grep it on purpose** |
| debugging your own server error | `.logs/dev-errors.jsonl` |

Claude Code loads the skills by itself when a task matches their `description`.
Other agents have no such mechanism: read the file directly — they are plain
markdown and self-contained.

---

## Where things go

| Task | Location |
|---|---|
| Add a page / route | `app/pages/` — file-based routing |
| Change site chrome (nav, footer) | `app/layouts/default.vue` — **not** `app/app.vue` |
| Change the error page | `app/error.vue` — renders *instead of* the layout |
| Add a UI component | `app/components/` — auto-imported |
| Add a client composable | `app/composables/` — auto-imported |
| **Submit a form to the API** | **`useApiForm()`** — never hand-roll `$fetch` + error state |
| A mutation with no form fields (delete, logout) | `$fetch` in the event handler |
| Add an API endpoint | `server/api/` — file = route, `.get.ts`/`.post.ts` = method |
| Add a resource that belongs to another | read **Relations and ownership** below first |
| Add a server helper | `server/utils/` — **auto-imported across the server** |
| Change the database | `server/database/schema.ts`, then `pnpm db:generate` |
| Add a wire contract (validation) | `shared/schemas/` — imported by both sides |
| Add a shared type | `shared/types/` — auto-imported in app *and* server |
| Add a script | `scripts/` — run with `tsx` |
| Unit test | `tests/unit/` — fast, no DB |
| E2E test | `tests/e2e/` — needs a running DB; builds and reseeds itself |

The vertical slice for **posts** is the reference implementation. To add a new
resource, copy its shape end to end:

```
server/database/schema.ts        table + relations
shared/schemas/post.ts           zod contracts — create AND update (see below)
shared/types/api.ts              response types (type-only import from schema)
server/utils/posts.ts            row -> API mapping (the ONLY place it becomes JSON)
server/api/posts/index.get.ts    list (visibility rules)
server/api/posts/index.post.ts   create (owner from session)
server/api/posts/[id].get.ts     read
server/api/posts/[id].patch.ts   update
server/api/posts/[id].delete.ts  delete
app/pages/posts/                 new.vue, [id]/index.vue, [id]/edit.vue
```

You do **not** need to write a drift test per resource.
`tests/unit/schema-drift.test.ts` discovers every `*CreateSchema` in
`shared/schemas/` and checks its field *names* against the matching table by
convention (`commentCreateSchema` → `comments`): every field names a real
column, no field is server-owned, and every required-without-default column
is covered. It is a name-level check — it does not compare Zod types,
nullability, or refinements against the column, so `published: z.string()`
would still pass. Adding a table with no contract fails that suite until you
write one or record the exemption in `TABLES_WITHOUT_A_WIRE_CONTRACT` with a
reason.

### Forms

Use `useApiForm()` (`app/composables/`) for submitting a form with
field-level errors. It owns `pending`, routes the server's 422 field errors
back onto the matching `UFormField`, and toasts anything not attributable to
a field:

```ts
const { submit, pending, errors } = useApiForm<PostWithAuthor>('/api/posts', {
  method: 'POST',
  onSuccess: post => navigateTo(`/posts/${post.id}`)
})
```

Pass a getter for the URL when it varies (`app/pages/login.vue` switches
between sign-in and register). Bind `:error="errors.<field>"` on each
`UFormField`. Do not hand-roll `$fetch` + `ref(false)` + try/catch for a form
— that loses the 422 wiring, and the duplication diverges across pages.

A bare mutation with no form fields (delete, logout) has no field errors to
route anywhere — call `$fetch` directly in the event handler instead
(`app/pages/posts/[id]/edit.vue`'s delete button, `app/layouts/default.vue`'s
logout).

Reads are different: use `useFetch` at setup level (see rule 4 below).

### Pagination

Keep the page in the URL, not in component state — `app/pages/index.vue` is
the reference. A computed `query` passed to `useFetch` refetches on change by
itself, so don't add a watcher, and always clamp the parsed page (a
hand-edited `?page=0` would otherwise send a negative offset and get a 422).

### Relations and ownership

`posts` is owned by exactly one user, which is the easy case. There is no
nested resource in this template on purpose — but the first one you add is
where the reference slice stops being enough, so here is the shape. Take
`comments` belonging to a `post` as the example.

1. **The parent id comes from the route, never the body.** Nest the route
   (`server/api/posts/[id]/comments/index.post.ts`) and leave `postId` out of
   `commentCreateSchema` entirely — same reasoning as `authorId` in rule 9. A
   parent id read from the body lets a client attach a row to someone else's
   parent. Add it to `SERVER_OWNED` in `tests/unit/schema-drift.test.ts` so the
   drift test enforces that for you.

2. **Load the parent first, with its own visibility rule.** A comment on
   somebody else's draft must 404 exactly like the draft does (rule 10).
   Re-derive visibility from the parent — do not assume "the row exists" means
   "this caller may see it". Getting this wrong leaks the *existence* of
   private parents even when the child data looks harmless.

3. **There are two owners, so decide per verb.** The comment author and the
   post author are different people with different rights: typically the
   comment author may edit, and either may delete. Write that down in the
   handler rather than defaulting to `row.authorId === user.id` out of habit.

4. **Cascade the foreign key** (`onDelete: 'cascade'`, as `posts.authorId`
   already does), or deleting a post silently orphans its comments.

5. **Scope unique indexes to the parent.** `uniqueIndex().on(t.postId, t.slug)`,
   not `.on(t.slug)` — a globally unique child key means one tenant's row can
   block another's, which is a bug you find in production, not in tests.

6. **The moment authorisation stops being one comparison, extract it.** One
   helper in `server/utils/` (`assertCanEditPost(row, user)`), called from every
   handler. Copied checks drift, and the copy that drifts is the one that
   forgot the tenant predicate. `pnpm verify` cannot catch a missing `WHERE
   tenant_id = ...` — nothing here can — so it has to live in one place.

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
| A valid icon name | grep the installed collection (below) | small |

Icons are `i-<collection>-<name>`, and only two collections are installed —
`lucide` and `simple-icons`. A name that isn't in them renders as blank space
with no build error, so check before you use one:

```bash
# does i-lucide-newspaper exist?
rg -o '"newspaper[^"]*"' node_modules/@iconify-json/lucide/icons.json | head
```

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

11. **Never build an update schema with `createSchema.partial()`.** Zod's
    `.partial()` makes fields optional but keeps `.default()`, so a PATCH of
    `{title}` also writes `body: ''` and `published: false` — renaming a post
    wipes its content. Define the fields once without defaults, apply defaults
    only in the create schema (`shared/schemas/post.ts`). This shipped once and
    passed every check in `pnpm verify`.

12. **`runtimeConfig` is only overridden by `NUXT_`-prefixed env vars.**
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
| `pnpm verify` | **typecheck + lint + test + migration freshness + vendored docs pinned** |
| `pnpm dev` | dev server |
| `pnpm db:up` / `db:down` | start / stop Postgres (Docker) |
| `pnpm db:generate` | create a migration after editing the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | deterministic seed (fixed UUIDs, see `scripts/seed.ts`) |
| `pnpm db:reset` | drop → migrate → seed, unattended — **DROPs the schema**; refuses any host that isn't local |
| `pnpm test` | unit tests (fast, no DB) |
| `pnpm test:e2e` | Playwright — **builds first and resets the DB**, so it tests your actual change and is repeatable |
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

### What the auth deliberately is not

Email + password with a sealed session cookie, and nothing else. There is **no**
rate limiting, password reset, email verification, session revocation or
disabled-account check. Do not assume any of them exist because a login form
does.

Two consequences worth knowing before you build on it:

- The session cookie is a bearer credential valid until it expires. Deleting or
  disabling a user does **not** log them out, and `user.name` in the session is
  a snapshot from login, not the current row. Anything that must be current —
  or revocable — has to be read from the database per request.
- Authorisation is per-handler, by hand (`authorId === user.id`, see rule 9).
  There is no policy layer. That scales to owner-scoped resources and stops
  scaling the moment a resource is shared, nested under another user's row, or
  scoped to an org — at which point the check belongs in one helper, not copied
  into each handler.
