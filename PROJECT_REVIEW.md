# Project review: agent-first Nuxt template

<!-- markdownlint-disable MD013 -->

**Reviewed:** 2026-07-25

**Scope:** agent experience, progressive-disclosure documentation, Nuxt architecture, TypeScript/ESLint, API/database/auth, tests, CI, and Docker deployment

**Method:** read all authored application/server/shared/script/test files and root configuration; ran the documented verification and behavioral paths; ran targeted concurrency, validation, logging, audit, and container probes. Per the request, no skills were run and no source changes were made. This review is the only intended repository change.

## Verdict

This is **substantially stronger than a typical Nuxt starter**, especially for agent-driven development. The single verification entry point, deterministic database reset, shared validation, explicit row-to-wire mapper, migration freshness check, behavioral test guidance, version-pinned local docs, and carefully configured TypeScript contexts are all good foundations.

I would use it as the basis for future work **after fixing the two blockers below**. I would not publish or deploy projects from the template unchanged today:

1. `docker build -t app .` produces the **migration image**, not the runtime image.
2. unhandled database errors can put email addresses and password hashes into production logs despite the documentation claiming secrets are redacted.

The next tier is also important for a reusable base: unique-constraint races return 500, typoed PATCH fields silently return 200, public auth has no rate limiting, security regression coverage is thinner than the agent guide claims, and the Node runtime/type contract is not pinned consistently.

| Area | Assessment |
| --- | --- |
| Agent feedback loops | Strong design, weakened by noisy/leaky error logging and several false-green paths |
| Progressive disclosure | Good routing model, but the always-loaded agent file has grown into a 4,193-word manual |
| Nuxt practices | Mostly strong and idiomatic SSR/Nitro usage |
| TypeScript/ESLint | Strong, deliberately balanced baseline; one material lint-coverage gap |
| Data/auth/API | Good ownership and validation shape; needs race, hardening, and secret-handling fixes |
| Tests/CI | Good mechanical and vertical-slice coverage; security and deployment gaps remain |
| Deployment | Explicit `runtime` target is sound; the documented default image is currently wrong |

---

## Validation results

These results describe the repository as reviewed, not just static impressions.

| Check | Result | Notes |
| --- | ---: | --- |
| `pnpm verify` | **PASS** | 5/5: typecheck, lint, 32 unit tests, migration freshness, vendored version markers |
| `pnpm test:e2e` | **PASS** | production build plus 7/7 Playwright tests against reset Postgres |
| `docker compose config --quiet` | **PASS** | Compose is syntactically valid |
| `docker build --check .` | **PASS** | Dockerfile syntax/lint passed; this did not catch the default-target semantic bug |
| `docker build --target runtime ...` + HTTP probe | **PASS** | runs as user `app`, serves `/`, command is `node .output/server/index.mjs` |
| documented `docker build -t app .` inspection | **FAIL** | command is `drizzle-kit migrate`, user is root/empty; image is about 254 MB versus about 61 MB for `runtime` |
| anonymous mutation probe | **PASS** | POST `/api/posts` returned 401 |
| misspelled PATCH probe | **FAIL** | an unknown spelling of `published` returned 200 and changed nothing |
| 8 concurrent same-email registrations | **FAIL** | one 201 and seven 500 responses |
| 2 concurrent same-slug PATCH requests | **FAIL** | one 200 and one 500 response |
| production log secret probe | **FAIL** | database error output included the submitted email and an scrypt password hash |
| `pnpm audit --prod` / `pnpm audit` | **Known failure** | one high advisory, `GHSA-mh99-v99m-4gvg` in `brace-expansion@2.1.2`; it was absent from `.output` and is already explained in `pnpm-workspace.yaml` |
| TypeScript LSP sweep | **PASS for confirmed files** | all 38 TS files confirmed clean; Vue LSP did not finish, but `nuxt typecheck` and the production build both passed |

The production response probe also found no explicit CSP, HSTS, frame, MIME-sniffing, referrer, or permissions-policy headers. Whether some belong at the reverse proxy is a deployment decision, but the template currently neither supplies nor documents that boundary.

---

## Prioritized findings

## Blockers

### B1. The documented default Docker build creates the migration image

**Locations:** `Dockerfile:40-66`, `README.md:87-99`

Docker uses the last stage as the default target. `runtime` is declared at `Dockerfile:40`, but `migrate` is declared last at `Dockerfile:65`. Therefore:

```bash
docker build -t app .
```

creates an image whose command is:

```text
["./node_modules/.bin/drizzle-kit", "migrate"]
```

It does not run the app. It also retains the build stage, source, and dev dependencies and runs without the non-root `app` user. The reviewed default image was about 254 MB; the explicit runtime target was about 61 MB.

This directly contradicts the deployment recipe and the intended separation between migration and application startup.

**Fix:** make `runtime` the final Dockerfile stage, or require `--target runtime` everywhere. Prefer both: place `migrate` before `runtime`, and make the README/CI explicit about both target names.

**Acceptance:**

- `docker build -t app .` has command `node .output/server/index.mjs` and user `app`.
- `docker build --target migrate -t app-migrate .` has command `drizzle-kit migrate`.
- Both images are started in CI; the runtime receives an HTTP probe.

### B2. Error logs can leak password hashes and email addresses

**Locations:** `server/utils/logger.ts:11-40`, `server/plugins/error-log.ts:29-46`, `eslint.config.mjs:53-57`, `CLAUDE.md:453-463`

`logger` is a plain `consola.withTag('app')`; it does not redact arguments. The `redact()` helper only masks sensitive **object keys**, URL credentials, and bearer tokens. It does not recognize secrets embedded in an error message string.

A concurrent registration unique violation produced a Drizzle error containing:

```text
params: <submitted email>,<name>,<scrypt password hash>
```

That appeared in production stdout both in the project hook's `logger.error(...)` call and Nitro's default unhandled-error output. In development, the same message can also be written to `.logs/dev-errors.jsonl`: `message` is not a sensitive key, and its string contents are not scrubbed.

The current comments are therefore unsafe guidance: they tell future agents that using `logger` makes secrets redacted when it does not.

**Fix:** treat this as a logging architecture issue rather than extending one regex indefinitely.

- Catch expected database errors and convert them to sanitized H3 errors before they become unhandled.
- Wrap logger methods so structured arguments are always redacted; do not export raw Consola as the safe logger.
- Configure a custom Nitro production error handler, or equivalent, that never emits raw database error messages/causes/parameters.
- Keep detailed diagnostics only after sanitization.
- Add a test that sends unique marker values through a failing query and asserts neither stdout nor `.logs/dev-errors.jsonl` contains them.

**Acceptance:** a forced database error remains diagnostically useful (request, route, status, constraint/code, correlation ID) but logs contain neither submitted PII, session material, connection strings, nor password hashes.

## High priority

### H1. Unique-constraint races return 500

**Locations:** `server/api/auth/register.post.ts:11-33`, `server/api/posts/[id].patch.ts:20-37`, reference implementation at `server/api/posts/index.post.ts:17-40`

The create-post endpoint correctly catches `23505` after its pre-check. Registration and post PATCH repeat the same SELECT-then-write pattern but do not catch the database constraint.

Observed behavior:

- eight concurrent registrations for one email: one 201, seven 500;
- two concurrent attempts to PATCH different posts to one slug: one 200, one 500.

The database constraint is the authoritative check. The pre-query is only an early user-friendly check and can never remove the need to handle `23505`.

**Fix:** handle `users_email_key` and `posts_slug_key` at the write in every relevant endpoint and return the documented 409 field-error envelope. Consider a small helper that maps known constraints to field errors so future resources copy one safe pattern.

**Acceptance:** concurrent tests return one success and only 409s for losers; no expected uniqueness conflict reaches the unhandled error hook.

### H2. Unknown request keys and empty PATCH bodies are false-green no-ops

**Locations:** `shared/schemas/post.ts:34-55`, `server/utils/validate.ts:31-52`, `server/api/posts/[id].patch.ts:34-46`

Zod objects strip unknown keys by default. For example:

```json
{ "publish": false }
```

parsed as `{}`, returned 200, logged `post updated`, and left the row unchanged. An empty PATCH behaves the same way by design.

This is especially harmful in an agent-first template: a typo looks like a successful behavioral probe. The log compounds the false positive by claiming an update happened.

**Fix:** use strict wire objects (or an explicit unknown-key rejection policy), reject PATCH requests containing no recognized fields, and only emit an update log when a write occurred. Adjust the generic PATCH regression test so it proves “no defaults are injected” without requiring `{}` to be a valid request.

**Acceptance:** typoed or empty PATCH requests return 422 with an actionable error; a valid one-field PATCH still preserves every omitted field.

### H3. Public password auth has no abuse control

**Location:** explicitly documented at `CLAUDE.md:544-561`; endpoints under `server/api/auth/`

The omission is honestly documented, but it is still a production risk. Login performs expensive scrypt verification and registration performs expensive hashing plus a database write. Without per-IP/per-account throttling, these are brute-force, credential-stuffing, resource-exhaustion, and account-spam endpoints.

For a project-specific prototype this can be deferred. For a template advertised as a strong reusable auth base, rate limiting should be included or the README must label auth as development-only until the inheriting project supplies it.

**Fix:** add a storage-backed rate limiter suitable for multiple replicas, document trusted-proxy/IP handling, and cover login and registration. Do not rely only on in-process memory if horizontal deployment is supported.

**Acceptance:** repeated attempts return 429 with deterministic tests, successful login resets or appropriately advances counters, and proxy/IP assumptions are explicit.

### H4. Security/authorization tests do not match the agent guide's claims

**Locations:** `CLAUDE.md:81-104`, `tests/e2e/posts.spec.ts:19-105`

The guide says the e2e file already covers all three key probes. It does not:

- there is no test that an unauthenticated mutation returns 401;
- “a draft is a 404 for anyone but its author” only checks an anonymous request;
- there is no signed-in non-owner draft test;
- there is no non-owner PATCH/DELETE test;
- registration and unique-race behavior are untested.

These are security boundaries, so manual probes are not enough for a template whose future agents will change handlers.

**Fix:** add API-level Playwright coverage using separate cookie jars for Ada, Grace, and anonymous callers. Include 401 mutations, owner visibility, signed-in non-owner 404, non-owner PATCH/DELETE 404, and the uniqueness conflicts from H1.

**Acceptance:** the guide's three probes each map to named automated tests, and their caller identities are explicit in test names.

### H5. The Node runtime and Node type versions are inconsistent and not enforced locally

**Locations:** `package.json:44-54`, `.github/workflows/ci.yml:27-30,73-76`, `Dockerfile:15,40`

CI and production use Node 24, while `@types/node` is 26. The package has no `engines.node`, `devEngines`, `.node-version`, or equivalent local pin. The review itself ran under local Node 26, demonstrating that contributors can silently use a different runtime.

This permits TypeScript to approve Node 26 APIs that production Node 24 does not provide.

**Fix:** make Node 24 the single declared contract: align `@types/node` to 24, add an engine/runtime pin, and make installation fail or warn clearly on the wrong major. Keep CI and Docker on the same major.

**Acceptance:** a Node-26-only API fails typecheck, and a clean setup selects or clearly requires Node 24.

### H6. Post queries load private user columns before mapping them away

**Locations:** `server/utils/posts.ts:6-27`, `server/api/posts/index.get.ts:28-40`, `server/api/posts/[id].get.ts:16-19`, `server/api/posts/index.post.ts:45-49`, `server/api/posts/[id].patch.ts:39-43`

The mapper correctly omits email and `passwordHash`, and its regression test is valuable. However, every `with: { author: true }` query loads the full `User` row, including both fields. The safe mapper is then the only barrier preventing disclosure.

A safer default is not to retrieve secrets for a public response at all. That narrows the blast radius of a future accidental `return row`, debug log, serialization change, or error dump.

**Fix:** select only `id`, `name`, and `avatarUrl` for post authors and type the mapper against that projection rather than `User`.

**Acceptance:** SQL/query result types for post responses cannot contain `email` or `passwordHash`; the mapper leak test remains.

---

## Medium priority

### M1. Expected 4xx responses are logged as errors

**Locations:** `server/plugins/error-log.ts:27-46`, current e2e output

The hook is described as recording “unhandled server errors,” but it receives expected H3 errors too. The existing dev log contained only 401/404/409/422 entries, and the passing e2e run printed expected 409 and 404 cases as `[app] ERROR`.

This lowers signal for both agents and production alerting. It also makes an expected authorization probe look like a server fault.

**Fix:** classify expected 4xx responses separately (usually no error log, or structured debug/info without a stack); reserve error-level output and the agent error file for unexpected 5xx conditions. A correlation ID would make client reports and logs easier to join.

### M2. `CLAUDE.md`/`AGENTS.md` is no longer progressive-disclosure sized

**Location:** `CLAUDE.md` (symlink target of `AGENTS.md`)

The routing strategy is good, and the non-guessable rules are unusually valuable. But the always-loaded file is 561 lines, 4,193 words, and 27 KB. It contains the verification manual, resource tutorial, form tutorial, relation design guide, search guide, UI lookup guide, 15 detailed incident narratives, command reference, database guide, TypeScript 7 research, and auth limitations.

That is a manual, despite the opening claim that it is a map. Every agent pays the context cost even when changing one button.

**Fix:** retain in `AGENTS.md`:

- the definition of done;
- the routing table;
- concise one- or two-line versions of truly non-guessable invariants;
- mandatory “read before doing X” links.

Move full rationale and recipes into task-routed plain Markdown such as `docs/agents/api-resources.md`, `ownership.md`, `verification.md`, and `toolchain.md`. These should not be skills, so every harness can read them. Keep the critical summary in `AGENTS.md`; do not hide a safety rule only in a linked file.

### M3. The local Postgres port is exposed on every host interface

**Location:** `compose.yml:13-15`

`${POSTGRES_PORT:-5432}:5432` binds to `0.0.0.0`. With the known `app`/`app` development credential, other machines on the LAN can reach the database when host firewall rules allow it.

**Fix:** default to `127.0.0.1:${POSTGRES_PORT:-5432}:5432`. Projects that intentionally need remote access can opt in explicitly.

### M4. Security headers have no defined owner

**Locations:** `nuxt.config.ts`, deployment documentation

A production response had `x-powered-by: Nuxt` but none of the common security headers. Some headers—especially HSTS—may appropriately belong at the ingress rather than Nitro, and CSP needs project-specific tuning. The problem is that the template neither sets a baseline nor states that the deployment layer must do it.

**Fix:** either configure a conservative application baseline (potentially with `nuxt-security`) or add an explicit deployment contract and automated header probe. At minimum decide ownership for CSP, HSTS, `X-Content-Type-Options`, frame protection, referrer policy, and permissions policy; remove `x-powered-by` unless it is intentionally retained.

The session dependency itself has sensible defaults (`HttpOnly`, `Secure` outside development, and `SameSite=Lax`), so preserve those.

### M5. Type-aware promise linting excludes scripts and tests

**Location:** `eslint.config.mjs:20-44`

The three high-value rules are enabled for `app/`, `server/`, and `shared/`, but not `scripts/` or `tests/`. Effective ESLint configuration confirmed they are undefined for `scripts/seed.ts` and `tests/e2e/posts.spec.ts`.

That exclusion misses the same silent failure class in destructive/important tooling: seed/reset database writes, sync downloads/file writes, process cleanup, and Playwright assertions can all be accidentally left floating.

**Fix:** add a separate type-aware block using `tsconfig.tools.json` for scripts and tests. If all three rules are too noisy in tests, keep `no-floating-promises` and `no-misused-promises` and document any narrow exceptions.

### M6. Dependency security has documentation but no machine-readable policy

**Locations:** `pnpm-workspace.yaml`, `.github/workflows/ci.yml`

The known `brace-expansion@2.1.2` advisory is analyzed carefully, including why force-upgrading breaks `minimatch`. It is absent from the runtime `.output`, which materially reduces impact. However, both `pnpm audit` variants always exit non-zero and CI does not run an allowlisted audit. An agent therefore cannot tell “only the accepted advisory remains” from “a new critical advisory appeared.”

**Fix:** add a small audit policy/allowlist keyed by advisory ID and affected version/path. CI should fail on any new advisory or when the accepted advisory changes. Keep the direct minimatch compatibility probe already documented.

### M7. CI's GitHub Actions permissions and references can be hardened

**Location:** `.github/workflows/ci.yml`

The project-wide scan reported broad default token permissions, checkout credential persistence, and tag-based rather than commit-SHA action references.

**Fix:** set top-level `permissions: contents: read`, use `persist-credentials: false` for checkout unless a job truly pushes, pin actions to reviewed commit SHAs (with version comments), and add job timeouts. This matters more in a template because every derived repository inherits the workflow.

### M8. The production container path is not exercised by CI

**Locations:** `.github/workflows/ci.yml`, `Dockerfile`

CI builds Nuxt through `pnpm test:e2e`, but never builds or starts the Docker image. That is why the default-target bug can coexist with a green CI run.

**Fix:** add a container smoke job that builds default/runtime and migration targets, inspects user/command, runs migration against the service DB, starts the runtime image, and probes health/SSR.

### M9. “Vendored docs pinned” checks version markers, not mirror integrity

**Location:** `scripts/verify.ts:141-175`

The check compares `VERSION` files to installed package versions. A committed edit, partial deletion, or stale file with an unchanged marker passes. Generated-file warnings are useful, but the mechanical claim is stronger than the check.

**Fix:** have sync scripts emit a deterministic manifest (paths plus content hashes) and verify it locally. Also verify required generated headers. This stays offline and makes corruption or accidental edits visible.

### M10. `verify` has several smaller feedback blind spots

**Locations:** `scripts/verify.ts`, `package.json:7-16`, `.github/workflows/ci.yml:38-41`

- `pnpm verify` does not build; CI catches production-build failures only later in the DB-backed e2e job.
- migration generation failure prints `stdout` but can lose the more useful `stderr` (`scripts/verify.ts:107`).
- CI's final `git diff --exit-code` does not detect untracked files, despite its comment saying any dirty file is impossible to miss.
- the migration freshness check intentionally changes the working tree when stale; that is useful, but the docs should keep describing it as a fixer/check with side effects rather than a purely observational check.

**Fix:** include a no-database production build in the standard mechanical path or create a clearly named `verify:full`; preserve both stdout and stderr on child-process failures; use `git status --porcelain` for cleanliness.

---

## Lower-priority improvements

| Finding | Location | Recommendation |
| --- | --- | --- |
| Stale source references undermine otherwise precise docs | `app/error.vue:4`, `shared/schemas/post.ts:4` | Point to `app/pages/posts/[id]/index.vue` and `server/api/posts/index.post.ts`. Add a lightweight path-reference/link check if comments continue to name files. |
| Manual behavioral recipe leaves `pnpm dev` running | `CLAUDE.md:67-70` | Capture `$!` and install a cleanup trap, or provide a checked script that starts, polls, probes, and stops the server. Orphan servers create port conflicts and false feedback. |
| `.dockerignore` omits `.agents/` while claiming vendored agent material is excluded | `.dockerignore:14-17` | Ignore `.agents/`, plus root agent docs if they are not needed during build. Runtime is unaffected, but build context/cache churn is avoidable. |
| Unsafe route-query assertions bypass runtime narrowing | `app/pages/login.vue:27`, `app/pages/posts/[id]/edit.vue:20` | Narrow `string \| string[]` explicitly and permit only local redirect paths. Nuxt blocks external navigation by default, but malformed query values can still turn a successful login into a swallowed navigation error. |
| SSR date rendering can vary by server/client locale or timezone | `app/pages/posts/[id]/index.vue:63` | Use a deterministic formatter/locale/timezone or Nuxt's time component to avoid hydration differences and date shifts. |
| Registration uses login autocomplete semantics | `app/pages/login.vue:89` | Use `autocomplete="new-password"` in register mode and `current-password` in login mode. |
| Text fields accept whitespace-only names/titles | `shared/schemas/auth.ts:13`, `shared/schemas/post.ts:35` | Apply intentional trim/normalization before `.min(1)` and test the wire value that is stored. |
| Build emits upstream Rollup annotation and plugin-timing warnings | production and Docker build output | Currently non-blocking and upstream-generated. Track only if they begin hiding project warnings; do not suppress globally without cause. |

---

## What is already strong

## Agent-first tooling and feedback

- `pnpm verify` is a real single entry point and runs all five checks even after an earlier failure. That is the right agent-feedback model: one tool round trip returns the full fix list.
- The summary is concise, timed, and gives targeted hints. The reviewed run passed all five checks.
- `pnpm db:reset` is deterministic and unattended, and its local-host allowlist is an excellent destructive-operation guard (`scripts/db-reset.ts`).
- E2E builds fresh output, never reuses an existing server, resets data automatically, and exercises SSR rather than only hydration (`playwright.config.ts`, `tests/e2e/`). These choices prevent several common false greens.
- Validation errors use a consistent 422 field map and `useApiForm()` routes that map back to controls. The 409 field-error path also works through the same composable.
- Migration freshness, schema-name drift, session-shape, response-leak, and PATCH-default regression checks encode real failure history rather than generic test ceremony.
- `.logs/dev-errors.jsonl` is a good concept: structured, greppable runtime feedback is exactly what a headless agent needs. B2 and M1 need fixing before the implementation matches the concept.
- Generated docs and skills place “do not edit” warnings in the files an agent actually opens, not only in a parent README.

## Documentation and progressive disclosure

- `AGENTS.md` is a symlink rather than a drifting copy; `.claude/skills` follows the same one-source pattern.
- The “start here” task router, location table, source-scoped search guidance, and component-API lookup strategy are practical and specific.
- Non-obvious, expensive failures are documented with causes: all TypeScript contexts, Drizzle thenables, runtime-config environment names, Postgres 18's volume path, partial-schema defaults, and one-Vue-version hydration failures.
- The docs clearly separate mechanical checks from behavioral validation. That is more honest than treating typecheck/lint as proof of endpoint correctness.
- Auth limitations are explicit rather than implied away.
- Version-pinned local Nuxt docs are useful for offline, low-context retrieval, and the guide warns agents to scope searches so the mirror does not drown source results.

The main documentation problem is not content quality; it is that too much high-quality content is loaded unconditionally. M2 is a restructuring recommendation, not a request to delete the incident knowledge.

## Nuxt, API, database, and auth design

- Universal SSR is used appropriately. Setup-level reads use `useFetch`; event-driven writes use `$fetch`/`useApiForm`.
- Database-backed routes are deliberately not prerendered.
- Nitro route files, shared schemas, server utilities, and UI composition follow Nuxt conventions.
- API validation is centralized and returns a stable client-consumable contract.
- Auth is enforced again at API boundaries; page middleware is correctly described as UX rather than security.
- Ownership comes from the session, not request bodies. Non-owner/private access returns 404 to avoid existence leaks.
- The list query combines visibility and caller filters correctly and uses a deterministic ordering tiebreaker.
- Passwords are hashed with scrypt; login uses a generic invalid-credentials message; sessions use the dependency's secure cookie defaults.
- Database access uses one process-level pool with a configurable maximum, and scripts share the same Drizzle connection factory/casing.
- Migrations are generated SQL and are separated conceptually from application startup. The explicit `migrate` and `runtime` targets are individually sound once B1 is fixed.
- The runtime target is non-root and contains only Nitro output.

## TypeScript and ESLint balance

- All four Nuxt-generated type contexts disable JavaScript and retain Nuxt's `strict` plus `noUncheckedIndexedAccess` defaults.
- `tsconfig.tools.json` closes the common gap for scripts, tests, and root configuration.
- Shared response types use erased type-only imports, so server/database code does not enter the client bundle.
- There is no `any` usage in authored source and very little unsafe assertion/casting.
- The ESLint baseline is strict on correctness without enabling the most contentious type-theory/style rules.
- `no-floating-promises`, `await-thenable`, and `no-misused-promises` are high-value additions. `checkThenables: true` is exactly right for Drizzle.
- Type-aware linting is scoped for performance; M5 recommends extending it through the already-existing tools tsconfig rather than turning on every strict rule everywhere.
- The TypeScript 7 hold is evidence-based and well documented rather than a stale “never upgrade” superstition.

---

## Recommended remediation order

1. **Fix B1 and add the Docker smoke test.** This immediately makes the documented deployment path real.
2. **Fix B2 and M1 together.** Establish one safe logging/error policy before adding more endpoints.
3. **Fix H1 and add concurrency regressions.** This also removes the currently demonstrated registration error leak path.
4. **Fix H2 and H4.** Make request typos and authorization failures mechanically visible.
5. **Add auth rate limiting (H3) before calling the template production-ready.**
6. **Align Node versions (H5) and extend promise linting (M5).**
7. **Stop selecting private author columns (H6).**
8. **Harden Compose, headers, CI, audit policy, and vendored integrity.**
9. **Restructure agent docs without losing the concise safety summaries.**
10. **Address the lower-priority polish table opportunistically.**

## Suggested completion gate for the fixing agent

Do not close the remediation work on a green `pnpm verify` alone. At minimum run:

```bash
pnpm verify
pnpm db:up
pnpm test:e2e
docker build -t app .
docker build --target migrate -t app-migrate .
```

Then repeat the targeted probes documented above:

- default image starts the app as `app`;
- migration image migrates and exits;
- concurrent registration/PATCH produce 409, never 500;
- typoed and empty PATCH produce 422;
- anonymous/non-owner mutations and drafts produce 401/404 as specified;
- known marker secrets do not occur in stdout or `.logs/dev-errors.jsonl`;
- only the explicitly accepted audit advisory remains.

## Final answer

**Yes, conditionally:** this is a good template architecture and a strong base in terms of conventions, feedback loops, and encoded engineering knowledge. It is better than most starters at preventing agent-induced drift and silent data bugs. **No, not unchanged:** the default Docker artifact and log-secret behavior are release blockers, while auth throttling, race handling, strict request feedback, and security coverage are necessary before describing derived projects as production-ready.

---

## Validation & remediation addendum (2026-07-25)

A second pass validated every finding against the code before fixing. **All findings were confirmed**; the review's runtime probes (image sizes, exact leaked log lines, `x-powered-by`) were confirmed at the mechanism level by reading the relevant source (`Dockerfile` stage order, `redact()`'s key-only masking, nitropack's `defaultHandler` raw `console.error`, `@nuxt/nitro-server`'s hardcoded renderer header).

Three remedies were adjusted during validation:

1. **H2** — the empty-`{}` PATCH no-op was a deliberate, commented decision; the actual defect was Zod stripping unknown keys. Fixed with `z.strictObject` on body contracts (query/param schemas stay loose on purpose) plus a 422 on truly-empty PATCH.
2. **B2** — instead of replacing the Nuxt/Nitro error handler (which owns the 422 contract and error.vue rendering), the fix scrubs the error object **in place** during the `error` hook's synchronous prefix, which nitropack runs before its default handler prints the raw object. Marker-based unit tests pin the behaviour.
3. **M6** — used pnpm's native `auditConfig.ignoreGhsas` (verified working on pnpm 11.13.1) rather than a custom allowlist script.

Owner decisions taken for the judgment-call findings: **H3** minimal in-process limiter, no new dependency (login: 5 failures/15 min per IP+email; register: 10/10 min per IP); **M2** modest trim of `CLAUDE.md`, monolith retained by design; **M4** app-level header baseline with HSTS/CSP explicitly delegated to the deployment layer.

All confirmed findings (B1–B2, H1–H6, M1–M10, and the lower-priority table except the build-warnings row, tracked as no-action) were remediated on branch `remediation/project-review`. The completion gate — `pnpm verify`, full e2e including the new `tests/e2e/security.spec.ts`, both Docker targets built and inspected, and the marker-leak probe against a forced unique violation — is recorded in the branch's commit messages and CI (`docker` smoke job).
