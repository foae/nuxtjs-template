# Nuxt 4 + Postgres template

A TypeScript, server-rendered starter for database-backed web applications.
It includes a working posts application, Better Auth email/password sign-in,
optional Google/GitHub and enterprise SSO sign-in, shared Zod validation, and
development guidance for humans and coding tools.

## What's included

- Nuxt 4, Nuxt UI 4 and Tailwind CSS 4, with configurable branding.
- PostgreSQL 18, Drizzle schema and migrations, and deterministic development seeds.
- Owner-scoped posts with drafts, pagination and create/edit/delete forms.
- Database-backed Better Auth sessions, optional email confirmation, password recovery, and database rate limiting.
- Vitest unit tests, Playwright browser/API tests, and GitHub CI that also boots the Docker image.
- Version-pinned upstream documentation and optional coding-tool skills in `.agents/skills/`.

## Prerequisites

- **Node.js 24 LTS** (the supported production runtime; see `.node-version`).
- **pnpm 12.4.2**, pinned in `package.json`. Install with `npm install --global pnpm@12.4.2`.
- **Docker Engine with Compose v2** for the local PostgreSQL service, or your own PostgreSQL 18 instance.
- Git; OpenSSL to generate a Better Auth secret (or another cryptographically secure generator).

GitHub CLI (`gh`) with repository write access is needed only for publishing releases.
The first install/build needs network access for packages and self-hosted font downloads.

## Get started

```bash
git clone https://github.com/foae/nuxtjs-template.git
cd nuxtjs-template
cp .env.example .env
openssl rand -base64 32
# Put the generated value in .env as AUTH_SECRET.
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The development seed is disposable fixture data, not a deployed user population.
Do not run a seed or reset against an existing database. Create local users through
the signup flow; deployment has no legacy-password migration or pre-existing users
to preserve.

### Configuration

`.env.example` documents the supported settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the application and migration tools |
| `AUTH_BASE_URL` | Canonical application origin only (no path or credentials); HTTPS in production except loopback production tests |
| `AUTH_SECRET` | Random Better Auth secret, at least 32 characters |
| `AUTH_MAIL_TRANSPORT` | Required explicit mail transport: `ses` for delivery or `capture` for local/test capture |
| `AWS_REGION`, `AUTH_EMAIL_FROM` | Required for `ses`; the sender identity must be verified in this SES Region |
| `AUTH_TEST_MODE=true` | Permits production test capture only with a loopback `AUTH_BASE_URL`; never enables a public test deployment |
| `AUTH_MAIL_CAPTURE_DIR` | Optional local/test capture directory (defaults to `.private/mail`) |
| `AUTH_TRUSTED_PROXY_IPS` | Optional comma-separated literal direct socket-peer IPs allowed to supply the client address |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Optional Google sign-in; both values are required together |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` | Optional GitHub sign-in; both values are required together |
| `AUTH_SSO_CONFIG_FILE` | Optional operator-controlled JSON array of enterprise SSO providers |
| `POSTGRES_PORT` | Optional local Compose port override; update `DATABASE_URL` to match |
| `DATABASE_POOL_MAX` | Optional connection limit per process; account for every replica |
Provider buttons appear only when their client IDs are configured.

### Authentication and email delivery

Better Auth 1.7.5 serves the standard endpoints below under `/api/auth`:
`/sign-in/email`, `/sign-up/email` (successful signup returns `200`),
`/sign-out`, `/get-session`, `/request-password-reset`, `/reset-password`,
`/send-verification-email`, and `/verify-email`. Sessions are database-backed,
last 30 days, have no cookie cache, and resolve the current user from the
database. Deleting a user cascades to their sessions and accounts.

Password signup grants access immediately. Email confirmation is an optional
reminder, not a login gate: the verification link must be opened while signed
in as the matching user, and anonymous or mismatched-session confirmation is
rejected. Password recovery revokes every existing session for that user.
There is no implicit or manual email-account linking: if another provider
returns an email already owned by a different provider identity, sign-in is
refused by default.

For production delivery set `AUTH_MAIL_TRANSPORT=ses`, `AWS_REGION`, and
`AUTH_EMAIL_FROM`. Verify the SES sender identity in that same region and
supply AWS credentials through the AWS SDK default credential provider chain
(for example, an attached workload role). Grant the runtime principal only
the needed `ses:SendEmail` permission, scoped to the approved identity where
the deployment policy supports it. Authentication startup fails closed when
the transport or required SES configuration is absent or invalid. Any optional
SES configuration set selected for the sender, or defaulted by the sender
identity, **must** disable open and click tracking for authentication links.

Password-reset requests always return the same generic response, including
when SES delivery fails, to avoid revealing which email addresses have
accounts. A successful response does **not** confirm delivery. Monitoring
must detect authentication-mail delivery failures, including authentication
mail errors and SES delivery/bounce events; there is no fallback to local
capture in production.

Reset-token consumption, credential replacement and session revocation share
one database transaction. A database failure rolls all three back, leaving
the reset token retryable. The endpoint wrapper uses the matching pinned
`@better-auth/core` transaction context and upstream reset implementation;
re-run the recovery failure-injection E2E test when upgrading Better Auth.
Reset-token identifiers are hashed at rest. Unused provider-token, account-list
and profile-update endpoints are disabled rather than exposed to the browser.

For explicit local/test capture set `AUTH_MAIL_TRANSPORT=capture`. Captured
messages are JSON files in `.private/mail` by default; the directory is
created mode `0700` and each message mode `0600`, so run the process under an
account permitted to own and read that directory. Capture requires development
or `AUTH_TEST_MODE=true` with a loopback origin. In a non-root Docker test,
set `AUTH_MAIL_CAPTURE_DIR` to a writable private volume or `/tmp/auth-mail`.

Register provider callbacks from the pinned Better Auth package source, using
the canonical origin: Google and GitHub use
`${AUTH_BASE_URL}/api/auth/callback/google` and
`${AUTH_BASE_URL}/api/auth/callback/github`; enterprise OIDC uses
`${AUTH_BASE_URL}/api/auth/sso/callback/<providerId>`; enterprise SAML uses
`${AUTH_BASE_URL}/api/auth/sso/saml2/sp/acs/<providerId>`. SAML service-provider
metadata is at
`${AUTH_BASE_URL}/api/auth/sso/saml2/sp/metadata?providerId=<providerId>`.
Keep the reverse proxy's public origin consistent with `AUTH_BASE_URL` and
route `/api/auth/*` without changing those callback paths. `AUTH_BASE_URL`
alone governs application redirect trust. Provider endpoint origins derived
from validated static SSO configuration are trusted only for IdP transport;
they do not add application redirect origins. In production, every configured
or discovered OIDC endpoint and SAML transport endpoint must use HTTPS.

The auth handler derives the client address from its direct socket peer.
`AUTH_TRUSTED_PROXY_IPS` is the exact comma-separated list of literal socket
peer IPs permitted to supply one client address through `X-Real-IP`; configure
each listed proxy to **replace**, not forward, that header. The handler
overwrites `x-auth-client-ip` with the resulting address on every request, and
ignores `X-Real-IP` from every unlisted peer. Configuration is loaded once per
process; restart after changing providers, secrets, or proxy settings.
Behind a reverse proxy, set `AUTH_TRUSTED_PROXY_IPS`: leaving it unset makes
every visitor share the proxy's sign-in rate-limit bucket (three attempts per
ten seconds), so one visitor can temporarily block sign-in for everyone.

`AUTH_SSO_CONFIG_FILE` is an operator-only static JSON file whose entries have
`providerId`, `label`, `domain`, and exactly one native Better Auth
`oidcConfig` or `samlConfig`. It is authentication configuration only: public
SSO provider/domain management and organization-role provisioning are disabled.
Do not expose the file or turn it into an application management API.

Keep machine/deployment-specific material in `.private/` or `.env` files; both are
Git-ignored and excluded from Docker builds. Never put real secrets in examples,
release notes or committed files. Ignoring a file does not remove it from Git history.
Production secrets should come from your deployment platform's secret store.

## Development and verification

```bash
pnpm check app/pages/index.vue  # after edits: cached lint autofix + full typecheck and units
pnpm verify                 # typecheck, lint, units, migration freshness, vendored manifests
pnpm exec playwright install --with-deps chromium
pnpm test:e2e               # production build + browser/API tests against E2E_DATABASE_URL
pnpm build                  # production output in .output/
pnpm preview                # preview the production build
```

`pnpm verify` needs no database. E2E requires `E2E_DATABASE_URL` to name a
dedicated disposable database ending in `_e2e`; it may reset only that explicit
database and never falls back to or resets `DATABASE_URL`. Stop the development
server with Ctrl-C; stop PostgreSQL with `pnpm db:down` (the Docker volume remains).

`pnpm test:e2e` also runs `pnpm test:auth`: controlled Google/GitHub, OIDC,
SAML, SES and startup-configuration regressions. Run `pnpm test:auth` alone
only after initializing the disposable `E2E_DATABASE_URL` schema. These
fixtures use local transports and generated identities, not deployment
credentials; they do not prove live provider configuration or SES delivery.

`pnpm check <files>` writes ESLint autofixes only after validating every
result's repository boundary, including symlinks discovered inside directories.
With no paths it fixes the whole repository; empty arguments are rejected,
and all-missing input explicitly skips lint. It is fast feedback, not a
replacement for `pnpm verify`, whose lint is uncached to catch imported-type
changes. Stop dev before check/typecheck/verify or builds, then restart before
runtime probes: Nuxt typecheck regenerates the same `.nuxt` tree dev uses.
The [Commands table in CLAUDE.md](CLAUDE.md#commands) is the complete script
inventory; its [Fast feedback section](CLAUDE.md#fast-feedback) covers scoped
commands and optional local hooks.

After changing `server/database/schema.ts`, run `pnpm db:generate` and
`pnpm db:migrate`, and commit the generated migration. `pnpm db:reset` is for
a disposable local schema only. For background development, use the
[captured-output recipe](CLAUDE.md#2-behavioural--run-the-thing-you-changed):
startup/HMR output goes to `.logs/dev.log`, and request diagnostics to
`.logs/dev-errors.jsonl`. Raw process output is not redacted; treat both logs
as private.

### Fork checklist

- Configure local auth/mail and database settings as above; E2E needs its own
  disposable `_e2e` database. Never reuse deployed data for fixtures.
- Make the aggregate **`ci`** check required in GitHub branch protection.
  Workflow files do not configure that setting for a fork.
- Activate Renovate for the fork; committing `renovate.json` does not install
  or authorize the service.
- Set up task tracking: install the `kaneo-cli` separately, export
  `KANEO_API_URL` (including the `/api` path), run `kaneo-cli auth login`, and
  create a Kaneo project named for the fork. Add the `Blocked` column — a new
  Kaneo project ships only four. Nothing here is provided by `pnpm install`,
  and no instance address is committed. See [Task management](#task-management).
- After framework/UI upgrades, run `pnpm docs:sync` / `pnpm skills:sync`
  and verify the regenerated, version-pinned mirrors. Neither script touches
  `.agents/skills/kaneo-cli/`: after upgrading the CLI, re-copy that skill by
  hand from the matching upstream release tag.
- Run `pnpm verify:full` for build/deployment changes, then exercise the
  production surface; plain `verify` does not build or prove runtime behavior.

Dependency auditing runs independently of quality verification. CI prints all
advisories; high/critical findings and audit execution failures block integration.
Lower severities are visible but non-blocking. Any exception must identify the
advisory, rationale, owner and expiry in a tracked task and use a narrowly scoped
pnpm exception; no permanent blanket ignores.

### Nuxt mechanics versus template conventions

Nuxt provides file-based pages/endpoints, auto-imports, server utilities, and
SSR-aware `useFetch` / `useAsyncData`. `useAsyncData(() => $fetch(...))` is valid;
the concern is bare setup-time `$fetch`, which can duplicate hydration requests.
Route middleware controls navigation, not API authorization.

This template chooses shared Zod contracts, `validateBody`/`validateParams`/
`validateQuery`, `useApiForm`, explicit response mappers and 422/404 error
contracts. They are project policies, not requirements imposed by Nuxt.
The lint boundary/validation guards catch direct syntactic bypasses only:
they do not prove transitive isolation, authorization or adequate validation.
Prefer these existing patterns rather than adding controller/repository layers.

### Repository layout

| Path | Contents |
|---|---|
| `app/` | Vue pages, layouts, components and client composables |
| `server/api/`, `server/routes/` | HTTP endpoints, including the Better Auth catch-all handler |
| `server/database/` | Schema, connection factory and migrations |
| `server/lib/`, `server/plugins/` | Auth, email delivery, logging and server helpers |
| `shared/` | Wire schemas and types shared across client/server |
| `scripts/` | Database, verification, upstream sync and release tooling |
| `tests/` | Unit and end-to-end tests |
| `_docs/` | Owned project/product documentation, including engineering decisions |
| `_vendor/nuxt/`, `.agents/skills/` | Pinned framework docs and optional development skills |

[`CLAUDE.md`](./CLAUDE.md) documents implementation contracts and release rules;
`AGENTS.md` is a symlink to that same file. `.claude/skills` similarly links to
`.agents/skills`. These are functional integrations, not authorship credits.
Do not hand-edit the generated mirrors `_vendor/nuxt/` and
`.agents/skills/nuxt-ui/`: use `pnpm docs:sync` / `pnpm skills:sync`.
`.agents/skills/kaneo-cli/` is **not** generated by either script — it is a
plain copy of an upstream release, updated by re-copying it.

Change the site name/theme in `app/app.config.ts`, the brand palette/fonts/radius
in `app/assets/css/main.css`, and the favicon in `public/`.

### Task management

Repository work is tracked in [Kaneo](https://github.com/usekaneo/kaneo), a
self-hosted project board. Unlike the rest of this template's tooling, it is
**not** a project dependency: `pnpm install` does not provide it and there is no
`pnpm` wrapper script. Install the
[kaneo-cli](https://github.com/foae/kaneo-cli) separately, point it at your own
Kaneo instance, and authenticate once:

```bash
export KANEO_API_URL="https://kaneo.example.com/api"   # the /api path is required
kaneo-cli auth login                                   # device flow; stores the credential
kaneo-cli auth get-session                             # confirm; null means not signed in
```

No instance address is committed anywhere in this repository, deliberately —
it would be wrong for every fork. Keep it in your shell environment.

Locate the board by discovery rather than a recorded ID, so a fork needs no
edit here:

```bash
kaneo-cli org list                                     # the org id IS the workspace id
kaneo-cli project list --workspace-id "$WORKSPACE_ID"  # the project named for this repo
kaneo-cli column list --project-id "$PROJECT_ID"       # slugs are the status values
kaneo-cli task list --project-id "$PROJECT_ID" --page 1 --limit 50
```

Track any change to `app/`, `server/`, `shared/`, the database schema, CI,
dependencies or the documented rules in `CLAUDE.md`. Typos, formatting and
comment-only edits do not need a ticket. The board columns are `To Do`,
`In Progress`, `Blocked`, `In Review` and `Done`, in that order, and a project
created fresh in Kaneo does **not** include `Blocked` until you add it. Kaneo
has no default column: `status` is a required field on create, so a new ticket
must name `to-do` explicitly rather than falling into it. Search first, record acceptance criteria and the
implementation plan, and capture verification evidence as comments. Move stuck
work to `Blocked` with a note identifying the blocker and the stage to resume.

Every ticket passes through `In Review` after implementation and local
verification, including documentation changes. Agents may mark it `Done` once
checks and review pass and the implementation has landed on `main`; no
mandatory human approval is required. Release publication is tracked separately
and does not delay `Done`. These are workflow rules for contributors, not
automated transition guards in the CLI.

Because tasks live on the Kaneo server rather than in version control, there is
no task file to commit with the work — **reference the task key in the commit
message** instead, or a commit's rationale is recorded nowhere. Note that
`task update` replaces a task wholesale; use the narrow `task update-status`,
`update-priority` and `update-description` commands for single-field changes.
`.agents/skills/kaneo-cli/SKILL.md`, vendored from the CLI's own release, is
the full command reference. Do not store secrets in tasks or comments.

`_docs/` is reserved for owned project/product documentation, including
`_docs/decisions/`. `_vendor/nuxt/` holds generated, version-pinned upstream
reference material, not application docs. Both are excluded from Docker build
contexts; task tooling is for development only. When deriving a new project
from this template, create your own Kaneo project named for the new repository.

## Deployment

Run migrations separately before rolling out the application. Create a private
`.private/production.env` with the real database URL, `AUTH_BASE_URL`,
`AUTH_SECRET`, and SES delivery configuration; do not use local Compose
credentials, mail capture, or seed data in production.

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

Place an HTTPS reverse proxy in front of the app. The configured
`AUTH_BASE_URL` must be the exact public HTTPS origin and `/api/auth/*` must
remain reachable at that origin for provider callbacks. The app sets basic
security headers; configure HSTS at TLS termination and a project-specific CSP
at the proxy. Back up your database and plan migration rollback before deployment.

### Security boundaries

This is a starter, not a complete identity platform. Better Auth provides
database-backed 30-day sessions, password recovery with session revocation,
and optional signed-in email confirmation, but it has no disabled-account
policy or public enterprise-SSO administration. Authentication rate limits are
stored in the database: the default general budget is 100 requests per 60
seconds, with sign-in and sign-up limited to 3 per 10 seconds and password
recovery limited to 3 per 60 seconds. Provider-email collisions fail closed;
accounts are never implicitly linked. Session reads are exempt so SSR does not
consume a shared internal budget. Review these boundaries before using the
template for sensitive data. No deployed users or legacy password hashes are
migrated by this template; retain the UUIDs owned by a deployed database rather
than replacing them during an auth rollout.

## Dependencies

Updates use stable releases that satisfy the complete toolchain. Current exceptions:
TypeScript remains on 6.x because typescript-eslint excludes 7.x and vue-tsc depends
on the removed compiler API ([evidence](_docs/decisions/typescript-7.md)); Vitest is on
5.x (`@nuxt/test-utils` accepts `^4.0.2 || ^5.0.0`); `@types/node` stays on 24.x to
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
