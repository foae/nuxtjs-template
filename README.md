# Nuxt 4 + Postgres template

A TypeScript, server-rendered starter for database-backed web applications.
It includes a working posts application, email/password and optional Google/GitHub
sign-in, shared Zod validation, and development guidance for humans and coding tools.

## What's included

- Nuxt 4, Nuxt UI 4 and Tailwind CSS 4, with configurable branding.
- PostgreSQL 18, Drizzle schema and migrations, and deterministic development seeds.
- Owner-scoped posts with drafts, pagination and create/edit/delete forms.
- Sealed-cookie sessions, verified-email OAuth linking and basic auth rate limiting.
- Vitest unit tests, Playwright browser/API tests, and GitHub CI that also boots the Docker image.
- Version-pinned upstream documentation and optional coding-tool skills in `.agents/skills/`.

## Prerequisites

- **Node.js 24 LTS** (the supported production runtime; see `.node-version`).
- **pnpm 12.3.4**, pinned in `package.json`. Install with `npm install --global pnpm@12.3.4`.
- **Docker Engine with Compose v2** for the local PostgreSQL service, or your own PostgreSQL 18 instance.
- Git; OpenSSL to generate a session secret (or another cryptographically secure generator).

GitHub CLI (`gh`) with repository write access is needed only for publishing releases.
The first install/build needs network access for packages and self-hosted font downloads.

## Get started

```bash
git clone https://github.com/foae/nuxtjs-template.git
cd nuxtjs-template
cp .env.example .env
openssl rand -base64 32
# Put the generated value in .env as NUXT_SESSION_PASSWORD.
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000>. The seed command **deletes existing posts and users**;
run it only against a disposable development database, never production.
Development logins are `ada@example.com` and `grace@example.com`, both with password
`correct-horse-battery-staple`. These are public fixtures, not production credentials.

### Configuration

`.env.example` documents the supported settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, read by the app and migration tools |
| `NUXT_SESSION_PASSWORD` | Random session-sealing secret, at least 32 characters |
| `POSTGRES_PORT` | Optional local Compose port override; update `DATABASE_URL` to match |
| `DATABASE_POOL_MAX` | Optional connection limit per process; account for every replica |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `NUXT_OAUTH_GITHUB_CLIENT_ID`, `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | Optional GitHub sign-in |

Register OAuth callbacks as `http://localhost:3000/auth/google` or
`http://localhost:3000/auth/github` locally, and the corresponding HTTPS URLs in production.
Provider buttons appear only when their client IDs are configured.

Keep machine/deployment-specific material in `.private/` or `.env` files; both are
Git-ignored and excluded from Docker builds. Never put real secrets in examples,
release notes or committed files. Ignoring a file does not remove it from Git history.
Production secrets should come from your deployment platform's secret store.

## Development and verification

```bash
pnpm verify                 # typecheck, lint, units, migration freshness, vendored manifests
pnpm exec playwright install --with-deps chromium
pnpm test:e2e               # production build + DB reset + browser/API tests
pnpm build                  # production output in .output/
pnpm preview                # preview the production build
```

`pnpm verify` needs no database. E2E requires the disposable local database and
**resets its schema**. Stop the development server with Ctrl-C; stop PostgreSQL
with `pnpm db:down` (the Docker volume remains).

After changing `server/database/schema.ts`, run `pnpm db:generate` and
`pnpm db:migrate`, and commit the generated migration. `pnpm db:reset` drops,
migrates and reseeds the local schema. Runtime diagnostics are in
`.logs/dev-errors.jsonl`; redaction is best-effort, so treat logs as private.

### Repository layout

| Path | Contents |
|---|---|
| `app/` | Vue pages, layouts, components and client composables |
| `server/api/`, `server/routes/` | HTTP endpoints and OAuth callbacks |
| `server/database/` | Schema, connection factory and migrations |
| `server/utils/`, `server/plugins/` | Validation, sessions, logging and server helpers |
| `shared/` | Wire schemas and types shared across client/server |
| `scripts/` | Database, verification, upstream sync and release tooling |
| `tests/` | Unit and end-to-end tests |
| `docs/vendor/`, `.agents/skills/` | Pinned framework docs and optional development skills |

[`CLAUDE.md`](./CLAUDE.md) documents implementation contracts and release rules;
`AGENTS.md` is a symlink to that same file. `.claude/skills` similarly links to
`.agents/skills`. These are functional integrations, not authorship credits.
Do not hand-edit generated mirrors: use `pnpm docs:sync` / `pnpm skills:sync`.

Change the site name/theme in `app/app.config.ts`, the brand palette/fonts/radius
in `app/assets/css/main.css`, and the favicon in `public/`.

## Deployment

Run migrations separately before rolling out the application. Create a private
`.private/production.env` with the real database URL and session secret; do not
use the local Compose credentials or seed production.

```bash
docker build --target migrate -t app-migrate .
docker run --rm --env-file .private/production.env app-migrate
docker build -t app .
docker run --rm -p 127.0.0.1:3000:3000 --env-file .private/production.env app
```

The database hostname must be reachable **from the container**; `localhost` there
is not your host database. The default Docker target is the non-root app runtime;
`migrate` is a separate target. For a non-container deployment, run
`node .output/server/index.mjs` with production environment variables supplied.

Place an HTTPS reverse proxy in front of the app. The app sets basic security
headers; configure HSTS at TLS termination and a project-specific CSP at the proxy.
Back up your database and plan migration rollback before deployment.

### Security boundaries

This is a starter, not a complete identity platform. It has no password reset,
password-signup email verification, session revocation or disabled-account check.
Sessions expire after 30 days; deleting an account does not invalidate its cookie.
Rate limits are in-process and reset on restart: replace them with shared state
before scaling across replicas. OAuth accounts link only through verified email.
Review these boundaries before using the template for sensitive data.

## Dependencies

Updates use stable releases that satisfy the complete toolchain. Current exceptions:
TypeScript remains on 6.x because typescript-eslint excludes 7.x and vue-tsc depends
on the removed compiler API ([evidence](docs/decisions/typescript-7.md)); Vitest stays
on 4.x because `@nuxt/test-utils` requires `^4.0.2`; `@types/node` stays on 24.x to
match production. Vue packages are pinned together in `pnpm-workspace.yaml` to
prevent duplicate-runtime hydration failures. Recheck overrides with `pnpm audit`.

The upstream Nuxt CLI dependency `@bomb.sh/tab` still declares a `cac` 6 peer
while the resolved tree uses 7 (`pnpm peers check` reports it). Builds, development
startup and the integration suite pass; shell-completion compatibility is not
verified. This is not hidden with an override.

## Releases

The template follows Semantic Versioning: `package.json` is the version source,
and stable releases use immutable, annotated `vMAJOR.MINOR.PATCH` Git tags.
Vendored framework/skill versions remain independently versioned.
`private: true` in the package manifest prevents accidental npm publication; it
has no effect on GitHub visibility.

For each release-worthy change (including documentation/configuration), from a
clean `main` checkout:

```bash
pnpm release:prepare 1.0.1   # choose the next patch/minor/major as appropriate
# Write accurate release notes in .private/release-notes.md.
pnpm verify
pnpm test:e2e
git add package.json        # also stage the intended source/docs changes
git commit -m "Release v1.0.1"
git push origin main
# Wait for CI on this exact commit, not an earlier green run.
pnpm release:publish "Describe this release" .private/release-notes.md
```

Commit implementation changes before `release:prepare`, which requires a clean tree.
The publisher checks the exact remote commit and successful, non-skipped
verify/e2e/Docker CI jobs, creates and pushes an annotated tag without replacing
any existing tag, publishes a stable non-draft GitHub release, and verifies it.
If publishing fails after tagging, inspect the existing tag/release and finish
that release manually with `gh`; never delete or move a published tag to retry.
A version bump ensures even documentation-only releases run the full CI gates.

## Licence

MIT; see [LICENSE](LICENSE). Vendored Nuxt documentation retains its upstream
MIT/Nuxt team attribution. Functional generated-file provenance is preserved.
