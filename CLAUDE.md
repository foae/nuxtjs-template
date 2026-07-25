# CLAUDE.md · AGENTS.md

Server-rendered Nuxt 4 + Postgres template, built to be worked on by coding agents.

`AGENTS.md` is a **symlink to this file**, so Claude Code, pi, OpenCode, Codex
and Cursor all read the same text and no copy can drift. Don't replace it with
a real file: the summary that used to live there had already gone stale (it
advertised eleven non-guessable rules when there were twelve, and four `verify`
checks when there were five).

This file is a **map, not a manual**. It tells you where things live and which
rules are not guessable. It deliberately does not restate Nuxt documentation —
that is vendored in `docs/vendor/nuxt/`, pinned to the installed version — and
it hands off UI recipes to the skills listed below rather than inlining them.

**Everything an agent must not get wrong lives in this file, not in a skill.**
Skills are convenience, not a second source of truth: no rule is stored only in
one, so this file alone is sufficient whatever harness you are.

---

## Done means two things

A task is finished when **both** halves below pass. The first is a command.
The second is not, and no command can stand in for it — a PATCH bug that
silently wiped post bodies passed every mechanical check and shipped. Only
running the endpoint caught it.

### 1. Mechanical — `pnpm verify`

```bash
pnpm verify
```

Typecheck + lint + unit tests + migration-freshness + vendored-docs-pinned.
Needs no database, takes ~35s, and is the same command CI runs — there is no
separate list of checks that can drift from this one.

If it fails, fix it. Do not report success with a failing verify.
`pnpm lint:fix` auto-fixes formatting and import order; it will not fix a
logic rule for you.

**This project is TypeScript only.** `allowJs` is off in all four type
contexts, and a `.js`/`.jsx` file under `app/ server/ shared/ scripts/ tests/`
fails lint with a message saying so. `eslint.config.mjs` is the one exception —
ESLint loads flat config directly, so it cannot be TypeScript.

Beyond the Nuxt preset, the rules that will actually stop you are
`no-floating-promises` / `await-thenable` / `no-misused-promises` (type-aware:
`app/ server/ shared/` via the project service, `scripts/ tests/` via
`tsconfig.tools.json`), plus `eqeqeq`, `prefer-template`, `object-shorthand`
and `no-console` — log through `logger` on the server or `consola` in
scripts, never `console`. The type-aware pass is why lint takes ~15s rather
than ~3s; it is also the only thing that catches a forgotten `await` on a
write. See rule 14.

### 2. Behavioural — run the thing you changed

`verify` catches *mechanical* mistakes: type errors, style, a forgotten
migration, a contract whose field names no longer match its table. It cannot
catch a wrong rule in a handler, and it checks no types *inside* a contract —
`published: z.string()` passes verify and fails in Postgres.

**Anything touching data needs this half.** Recipe:

```bash
cp .env.example .env      # first run only; .env is gitignored, so a fresh clone has none
pnpm db:up && pnpm db:reset          # Postgres + deterministic seed
setsid pnpm dev & DEV_PID=$!         # background it — it never exits, and a
                                     # foreground run blocks you forever
until curl -sf -o /dev/null localhost:3000/; do sleep 1; done   # wait for boot
```

Kill the whole process group (`kill -- -$DEV_PID`) when you are done probing —
that is what `setsid` is for above. A bare `kill $DEV_PID` only kills the pnpm
wrapper: the nuxt tree survives, keeps the port, and answers the *next*
session's probes with *this* session's build while the new server exits with
"Another Nuxt dev is already running".

Poll for readiness rather than sleeping a fixed number of seconds — cold boot
time varies with machine and cache, and a `sleep` that is long enough today is
a flaky failure tomorrow.

The app is on `http://localhost:3000`. Authenticate with a cookie jar — the
session is a sealed cookie, so a bare `curl` is always anonymous:

```bash
curl -s -c /tmp/jar -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse-battery-staple"}'

curl -s -b /tmp/jar localhost:3000/api/posts          # now signed in as Ada
```

Three probes catch most of what `verify` cannot. Run the ones your change
could plausibly break:

| Probe | Expect |
|---|---|
| `PATCH` **one** field | every omitted field unchanged (rule 11) |
| `GET` another user's draft | `404`, signed in *or* not (rule 10) |
| any mutation with no cookie | `401` |

`scripts/seed.ts` exports `SEED_IDS` — fixed UUIDs for both users and both
posts, so you can address seeded rows directly instead of scraping ids.

When the behaviour is worth keeping, promote the probe rather than leaving it
in your shell: `tests/e2e/security.spec.ts` is the API-level home (it already
covers all three probes above with the caller identity in each test name,
plus unique-race 409s, strict-PATCH 422s, rate limiting and headers) and
`tests/e2e/posts.spec.ts` covers the browser flows — copy the matching shape.
`pnpm test:e2e` reseeds itself, so it is repeatable.

Unit test (`tests/unit/`) for a pure function — mapping, a schema, a helper.
E2E (`tests/e2e/`) for anything that crosses HTTP or touches the database.

---

## Start here — route your task

Find your task, go where it points. Rows in **bold** stay inside this file
because getting them wrong is expensive and skills don't load for every agent;
the rest are worth opening only when the task needs them:

| When you are… | Open |
|---|---|
| adding a page, route, or menu entry | `.agents/skills/nuxt-page/SKILL.md` |
| choosing or composing UI components | `.agents/skills/nuxt-ui/SKILL.md` + `references/` |
| after a component's exact props | `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts` |
| after framework behaviour (Nuxt itself) | `docs/vendor/nuxt/` — 235 markdown files, **grep it on purpose** |
| **adding an API endpoint or a resource** | **Adding a resource** below — stays in this file |
| **adding a resource owned by another** | **Relations and ownership** below — read it *first* |
| **changing the database** | **Changing the database** below |
| **checking your work actually behaves** | **Done means two things**, half 2, above |
| debugging your own server error | `.logs/dev-errors.jsonl` |

Skills live in **`.agents/skills/`** — the vendor-neutral
[Agent Skills](https://agentskills.io) location, not a Claude Code one. All
three harnesses auto-load them when a task matches the `description` in each
`SKILL.md`'s frontmatter:

| Harness | Discovers | Notes |
|---|---|---|
| **pi** | `.agents/skills/` natively | prompts once to trust project-local files; `--no-skills` opts out |
| **OpenCode** | `.agents/skills/` natively | also reads `.claude/skills/` and `.opencode/skills/` |
| **Claude Code** | `.claude/skills/` only | that path is a **symlink** to `../.agents/skills` |

`.claude/skills` is a symlink for the same reason `AGENTS.md` is: one copy,
every harness, nothing to drift. Claude Code has no `.agents/skills` support
(checked against 2.1.220), so the symlink is what makes it work — don't replace
it with a copy, and don't move the real files under `.claude/`.

Any agent that auto-loads none of this can just read the files: they are plain
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
| Unit test | `tests/unit/` — fast, no DB. Cannot resolve `h3` (transitive dep, pnpm isolation): keep testable server logic in an import-free util — see `server/utils/rate-limit-core.ts` vs `rate-limit.ts` |
| E2E test | `tests/e2e/` — needs a running DB; builds and reseeds itself |

### Adding a resource

The **posts** slice is the reference implementation. Build in this order, and
run `pnpm verify` after each step — a failure then names one file instead of
eight:

| # | Step | Where | Watch for |
|---|---|---|---|
| 1 | table + relations | `server/database/schema.ts` | rule 8 — write `authorId`, get `author_id` |
| 2 | migration | `pnpm db:generate`, then `db:migrate` | never hand-write the SQL |
| 3 | wire contract | `shared/schemas/<name>.ts` | rule 11 — create *and* update, defaults on create only; `z.strictObject`, so a typoed key 422s instead of silently no-oping |
| 4 | response type | `shared/types/api.ts` | `import type` only — rule 1 |
| 5 | row → JSON mapper | `server/utils/<name>.ts` | the ONLY place a row becomes JSON |
| 6 | handlers, one verb at a time | `server/api/<name>/` | file = route, `.get.ts`/`.post.ts` = method |
| 7 | pages | `app/pages/<name>/` | forms use `useApiForm()` — see below |
| 8 | behaviour | half 2 of **Done means two things** | the step `verify` cannot do for you |

**Copy the shape, not the fields.** Generic to every resource: the handler
skeleton, `requireUserSession`, the `validate*` helpers, the mapper, the status
codes, 404-not-403. Specific to *posts* and probably wrong for yours: `slug`
and its regex, the `published` draft-visibility rule, `title`/`body`. A
`comments` resource has neither a slug nor a draft state — don't carry them
over just because they were in the file you copied.

Not every resource needs all eight rows. A read-only endpoint is steps 1–6
with a single `.get.ts` and no pages. Don't create empty stubs for verbs
nothing calls.

**Validation is not hand-rolled.** `server/utils/validate.ts` is auto-imported
across the server and gives you `validateBody`, `validateParams` and
`validateQuery`. They throw a 422 whose `data.errors` is keyed by field name —
exactly what `useApiForm()` reads to put each message under the right input.
Reach for `readBody` plus a bare `.parse()` and that wiring is silently lost.

**Status codes are a contract, not a preference.** The client depends on them:

| Situation | Code | Why |
|---|---|---|
| invalid input | `422` | `useApiForm()` routes `data.errors` onto fields; `400` does nothing |
| not signed in | `401` | `requireUserSession` throws this for you |
| signed in, but not yours | `404` | never `403` — rule 10 |
| unique-constraint clash | `409` | carry `data.errors` so the field shows it — and catch it at the WRITE too (`isUniqueViolation`), the pre-check SELECT cannot stop a concurrent request |
| too many auth attempts | `429` | login counts only failures, registration counts all — `server/utils/rate-limit.ts` |

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

`docs/vendor/nuxt/` is 235 committed markdown files — deliberately committed
(grep is the cheapest lookup you have, version-pinned), but it **will drown
your searches**: `useFetch` has single-digit hits in source and 153 in the
mirror. Default to scoping searches to source, and search the docs only when
you actually want framework documentation:

```bash
rg "useFetch" app server shared tests scripts   # source, scoped
rg "shared directory" docs/vendor/nuxt/          # docs, on purpose
```

---

## Nuxt UI component APIs — read these, not the website

The vendored skill (`.agents/skills/nuxt-ui/`) teaches *which* component to
use. For *what a component accepts*, upstream tells you to use the Nuxt UI MCP
server. **This project ships no MCP.** Use the installed package instead — it
is version-exact and far cheaper:

| You need | Read | Cost |
|---|---|---|
| Props, slots, events | `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts` | ~500 tokens |
| Allowed `color`/`variant`/`size` | `.nuxt/ui/<name>.ts` — **first ~40 lines** | small |
| Which component, how to compose | `.agents/skills/nuxt-ui/` | — |
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

This table is the one copy of it that is **not** generated — the others live in
`.agents/skills/nuxt-ui/PROJECT-OVERRIDE.md` and in the banner `skills:sync`
injects, both of which carry the installed version. If a major `@nuxt/ui`
upgrade moves those paths, this table is what silently goes stale; check it
against `PROJECT-OVERRIDE.md` after any such bump.

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

13. **`docs/vendor/**` and `.agents/skills/nuxt-ui/**` are generated. Editing
    them destroys your work silently.** `pnpm docs:sync` and `pnpm skills:sync`
    delete and rewrite both trees, so an edit survives exactly until the next
    sync — and `pnpm verify` fails on it earlier than that: both trees carry a
    `MANIFEST.sha256` the vendored-docs check verifies. Every generated file
    also says so in an HTML
    comment after its frontmatter — if you opened a file and saw one, that is
    this rule. To change their content, change the script that writes it
    (`scripts/docs-sync.ts`, `scripts/skills-sync.ts`); `PROJECT-OVERRIDE.md`
    and the MCP banner are both emitted from `skills-sync.ts`.

14. **`no-floating-promises` needs `checkThenables: true` or it ignores every
    database call.** Drizzle's query builders are *thenables*, not `Promise`
    instances, and the rule skips thenables by default. Without the option it
    reports nothing on `db.update(...)` — the exact statement it exists to
    guard — while still looking enabled in `eslint.config.mjs`. A forgotten
    `await` on a write is valid TypeScript that `pnpm typecheck` accepts: the
    handler returns 200 and nothing is written. Don't drop the option to
    "simplify" the config.

15. **There are four TypeScript contexts, configured in three different
    places.** `typescript.tsConfig` is **app only**; `sharedTsConfig` and
    `nodeTsConfig` sit beside it; the server one is `nitro.typescript.tsConfig`.
    Set only the first and `server/` keeps the old setting with nothing
    reporting a problem — which is how `allowJs` stayed true for `server/`
    here until all four were checked. `tsconfig.tools.json` is a fifth,
    hand-written config covering `scripts/` and `tests/`, which Nuxt's
    generated project references do not reach. Verify a change with
    `pnpm nuxt prepare`, then read `.nuxt/tsconfig.*.json`.

16. **`@types/node` tracks Node 24 — the production runtime — not your local
    Node.** CI and the Docker image run 24 (LTS); types pinned to the oldest
    supported major make a Node-26-only API a typecheck error instead of a
    production crash. Don't "update" the types alone: bump them together with
    CI, the Dockerfile, `.node-version` and `engines`.

17. **CI skips prose-only changes, and "prose" is not "`.md`".** The `changes`
    job in `.github/workflows/ci.yml` runs the full suite unless *every*
    changed file is a `.md` (or `LICENSE`) — but `docs/vendor/**` and
    `.agents/skills/nuxt-ui/**` are excluded from that, because they are
    markdown that `pnpm verify` actively checks: every file in both is hashed
    into a `MANIFEST.sha256` (rule 13). ~296 of this repo's ~300 markdown
    files are in those two trees, so a naive `paths-ignore: '**.md'` would
    skip CI for almost exactly the files CI exists to guard. **Add a tree to
    `VENDORED` in `scripts/verify.ts` and you must add it to that `case` list
    too** — otherwise CI silently stops running the check you just added. Two
    further things not to "simplify": the filter is a *job*, not a trigger
    `paths-ignore` (GitHub never reports a check for a path-skipped workflow,
    so a required check waits forever and the PR cannot merge — a skipped
    *job* reports Success instead), and the `ci` aggregate job exists because
    a job that is skipped because its dependency *failed* also reports
    Success. Mark `ci` as the required status check, not the individual jobs.

---

## Debugging your own work

Server errors in dev are appended to `.logs/dev-errors.jsonl`, one JSON
object per line, with method, path, status, message, validation details and a
trimmed stack. Expected 4xx outcomes land here too (so you can debug your own
failing probe) but only 5xx/unhandled errors are logged at error level on the
console. Read it instead of asking for a pasted stack trace:

```bash
tail -5 .logs/dev-errors.jsonl | jq .
```

Known secret shapes are redacted before writing — sensitive key names,
connection-string credentials, bearer tokens, drizzle `params:` tails and
Postgres `Key (x)=(...)` details (`redact()` and `scrubErrorInPlace()` in
`server/utils/logger.ts`; the scrub runs in the error hook's synchronous
prefix so Nitro's own raw error print is covered too). Pattern-based, NOT
exhaustive: never log raw request bodies or credentials yourself.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm verify` | **typecheck + lint + test + migration freshness + vendored docs pinned (VERSION + content manifest)** |
| `pnpm verify:full` | verify + production build — for changes that could affect the build/deploy path; plain `verify` never builds |
| `pnpm dev` | dev server on `:3000` — **long-running, background it** (`pnpm dev &`) |
| `pnpm db:up` / `db:down` | start / stop Postgres (Docker) |
| `pnpm db:generate` | create a migration after editing the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | deterministic seed (fixed UUIDs, see `scripts/seed.ts`) |
| `pnpm db:reset` | drop → migrate → seed, unattended — **DROPs the schema**; refuses any host that isn't local |
| `pnpm lint` / `lint:fix` | ESLint; `:fix` auto-fixes formatting, not logic rules |
| `pnpm typecheck` | all four Nuxt contexts + `tsconfig.tools.json` |
| `pnpm test` | unit tests (fast, no DB) |
| `pnpm test:e2e` | Playwright — **builds first and resets the DB**, so it tests your actual change and is repeatable |
| `pnpm docs:sync` | re-mirror Nuxt docs at the installed version |
| `pnpm skills:sync` | re-vendor the Nuxt UI skill |

Everything except `verify` and `test` needs a `.env` — it is gitignored, so a
fresh clone has none. `cp .env.example .env` once; `DATABASE_URL` and a 32-char
`NUXT_SESSION_PASSWORD` are the two that matter. `verify` passing on a machine
with no `.env` is expected, not proof the database commands will work.

Seeded logins: `ada@example.com` / `grace@example.com`, password
`correct-horse-battery-staple`. `scripts/seed.ts` exports `SEED_IDS` with the
fixed UUIDs for both users and both posts (one published, one draft) — address
seeded rows through it instead of scraping ids out of a list response.

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

### TypeScript stays on 6.x — do not "upgrade" to 7

TS 7 is the Go-native rewrite and it breaks typescript-eslint, vue-tsc AND
Nuxt's generated `$fetch` types — three independent blockers, any one fatal
(checked 2026-07-25; full evidence in `docs/decisions/typescript-7.md`).
Re-test by bumping `typescript` and running `pnpm verify`; revert unless all
three pass. 6.0.3 is the latest 6.x, so we are not behind.

### What the auth deliberately is not

Email + password with a sealed session cookie, plus basic in-process rate
limiting on login and registration (per-IP; login counts only failed
attempts). That limiter is per-replica and resets on restart —
`server/utils/rate-limit-core.ts` says what must replace it before scaling
out. There is **no** password reset, email verification, session revocation
or disabled-account check. Do not assume any of them exist because a login
form does.

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
