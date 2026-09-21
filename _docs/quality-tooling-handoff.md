# Quality tooling improvements: implementation handoff

## Status and purpose

Recorded 2026-09-21 after a repository audit, cross-model second opinion, and user interview. Amended the same day after an independent second audit and a follow-up interview (see "Second audit" under the review record). **The improvements below are selected but not implemented.** This document is the requested deliverable; TASK-6 tracks writing it, not implementing the entire proposal.

The goal is a Nuxt template that gives future coding agents strong feedback and clear defaults without making them design controllers, dependency injection, or another application framework. Preserve Nuxt's native structure and leave agents focused on business logic.

Before implementing, search Backlog for related work, create or update appropriately scoped implementation tasks, inspect the current source, and record the researched plan. File references below are starting points, not a substitute for rereading current code. Do not infer permission to push, publish a release, or change remote repository settings from this handoff.

**Integration default.** Unless instructed otherwise, finished work that has passed verification and review may be committed directly to `main`; do not leave finished work uncommitted. Workflow skills may instead carry a task through a git worktree, a pull request, review, merge and release; when one is in use, follow it. This is a sane default, not a guardrail: pushes, releases and remote settings stay explicit owner steps.

## Selected scope

The user chose:

1. All four core corrections: page error handling, a stronger Docker database probe, targeted unsafe-value/Vue lint, and uncaught browser-error detection.
2. Explicit safety errors, not a blanket zero-warning policy.
3. Both bounded convention guards: direct-import boundaries and request-validation bypass.
4. Both behavioral test examples: form state transitions and public-response privacy.
5. Independent security auditing that blocks high and critical advisories.
6. Refined fork guidance and clearer distinctions between Nuxt requirements and template policy.

Added in the follow-up interview:

7. Two more convention guards that turn existing non-guessable rules into lint errors: no `.partial()` on a create schema (rule 11) and no `403` in API handlers (rule 10).
8. Promotion of three Vue rules from advisory to error: `vue/require-explicit-emits`, `vue/block-order`, and `vue/define-macros-order` (the last is currently not enabled at all).
9. `import/order` as an autofixable error, reconciling the existing documentation claim that `lint:fix` fixes import order.
10. Zero E2E retries in CI.

No optional accessibility tooling, actionlint, additional owned-file formatter, git hooks, dead-code detection (`knip`), complexity cap, or `no-non-null-assertion` was selected.

## Preserve the foundation

Keep the current stack and conventions:

- Nuxt file-based pages and API handlers; shared business logic in existing server helpers when needed.
- Nuxt-generated ESLint configuration and its TS/Vue stylistic formatting.
- Five TypeScript contexts, type-aware promise checks, migration freshness, and version-pinned vendored documentation.
- Shared input schemas, validation helpers, response mappers, and the reference posts slice.
- Production E2E and Docker checks alongside static verification.

Do not introduce controllers, repository/service layers, dependency injection, resource generators, a replacement formatter, or a new runtime response-schema framework. Add no dependencies unless necessary for the selected work and authorized under repository rules.

The normal path remains: page -> useFetch/useAsyncData -> file-based API handler -> validation and business logic. Plugins serve integrations; route middleware serves navigation, not API authorization.

## Workstreams and acceptance criteria

### 1. Correct the reference page's failure states

**Start:** `app/pages/index.vue`, `tests/e2e/posts.spec.ts`.

The audited page reads data/status without handling fetch errors; a failed posts request can render the successful-empty message. This is especially harmful in a template because agents copy the reference.

Required outcomes:

- A successful empty response displays the empty state.
- Initial SSR failure is visibly distinct from a successful empty result.
- A failed client pagination refresh is visibly an error, not an empty page or silently stale data presented as current.
- Subsequent successful navigation/retry recovers correctly; URL-based pagination remains intact.

Choose an idiomatic Nuxt error presentation consistent with the existing UI. Decide deliberately whether stale data remains visible; if it does, communicate its state.

**Proof:** exercise initial server-rendered failure and client-navigation failure separately, then recovery and the successful-empty case. Browser request interception does not intercept Nitro's internal SSR fetches: use a controlled server-side failure mechanism for that case, without shipping a production failure switch. Retain regression coverage for the false-empty bug. Visually verify the changed page.

### 2. Make the Docker smoke probe demonstrate database access

**Start:** `.github/workflows/ci.yml`, existing posts API response contract.

The audited Docker job only checks that `/` returns HTTP success. A page swallowing a database fetch failure can satisfy this probe.

Required outcomes:

- Preserve the existing image startup, runtime-user, command, and migration checks.
- Verify a database-backed API response succeeds and has the expected response structure, in addition to checking application startup.
- Do not require nonempty fixtures: a correctly initialized empty database must pass.
- A database-backed request failure must fail the probe; HTML success alone must not pass it.
- Keep bounded readiness waits, bounded requests, and useful failure logs.

**Proof:** run the actual runtime-image probe against an initialized disposable database; demonstrate failure when the database-backed request cannot succeed. Stop owned containers/processes afterward. Do not reset an existing database.

### 3. Strengthen targeted TS/Vue lint and severity semantics

**Start:** `eslint.config.mjs`, `scripts/check.ts`, `scripts/check-lint.ts`, `tests/unit/check-lint.test.ts`, `package.json`.

Add explicit TypeScript script-block enforcement through `vue/block-lang`, preserving valid scriptless Vue components. Add these targeted rules to application/server/shared code:

- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`

Do not enable an entire maximal strict preset or automatically expand this rollout to all tooling/tests. Retain promise rules, especially `checkThenables: true`.

Required outcomes:

- Unsafe operations fail in both TypeScript files and Vue SFC script blocks.
- Existing third-party boundary violations are resolved with genuine narrowing or a justified boundary design, not assertions that merely silence lint.
- Safety rules and unused lint suppressions fail local checks and CI.
- Genuine advisory warnings remain non-blocking; do not add a blanket `--max-warnings 0` policy.
- Local `check`, uncached lint, and verification apply consistent severities.

**Proof:** use positive and negative lint fixtures/probes for TS, Vue, scriptless components, and unused suppressions. Verify both local feedback and the uncached gate. An earlier trial found unsafe reports around Better Auth integration in `server/lib/auth.ts`; inspect current code before changing that security-sensitive boundary, and run relevant auth regressions if it changes.

Lint does not establish runtime validity: explicit generics, assertions, and inaccurate third-party declarations can still conceal invalid data.

### 4. Detect uncaught browser errors in meaningful E2E flows

**Start:** `tests/e2e/posts.spec.ts`, existing browser fixtures/helpers and Playwright configuration.

Required outcomes:

- Representative browser flows fail on uncaught page errors, with listeners installed before navigation.
- Cover hydration and client navigation rather than merely the initial HTTP response.
- Do not turn every console message into a failure or claim this checks all hydration diagnostics.
- Keep failures attributable to the affected test and avoid accumulated listeners between tests.

**Proof:** demonstrate a controlled uncaught error fails the guarded flow; normal production-build flows pass. Do not leave intentional runtime errors in application code.

### 5. Add bounded direct-import guards

**Start:** `eslint.config.mjs`, `shared/`, Nuxt-generated aliases and existing type-only imports.

Protect the official shared-code boundary and prevent accidental server runtime imports into client-capable application code.

Required outcomes:

- Shared runtime code cannot import Vue/Nitro or application/server runtime implementations.
- Type-only imports permitted by the existing contract remain valid.
- Legitimate server-only Nuxt surfaces are not rejected by a blanket app-directory ban.
- Account for applicable root aliases, relative traversal, re-exports, and dynamic imports; state any unsupported forms explicitly.
- Rule messages explain the supported destination/pattern rather than merely saying an import is forbidden.

**Proof:** positive/negative fixtures using the actual alias configuration, including type-only imports and legitimate server-only cases. Keep scope honest: direct-import lint is not transitive dependency analysis, bundle security verification, or a secret-leak guarantee. Do not use package-name substring searches in minified bundles as proof.

### 6. Guard against accidental input-validation bypass

**Start:** `server/api/`, `server/utils/validate.ts`, `eslint.config.mjs`.

Ordinary resource handlers should use the established `validateBody`, `validateQuery`, and `validateParams` path instead of reading input and trusting a generic or assertion.

Required outcomes:

- Direct raw request extraction in ordinary resource handlers triggers an actionable diagnostic.
- Existing validated handlers remain valid.
- The validation helpers themselves are not prohibited from reading requests.
- Intentional raw-body endpoints, such as signed webhooks, and delegated auth handling have narrow, explicit treatment rather than broad disabling of the guard.
- Diagnostics do not claim to prove authorization, validation adequacy, or all possible bypasses.

**Proof:** fixtures for ordinary validated handlers, prohibited direct extraction, and legitimate exceptions. Do not ban every `.parse()` call or build a custom security framework.

### 7. Provide a useful Nuxt runtime-test example

**Start:** `app/composables/useApiForm.ts`, `vitest.config.ts`, `tsconfig.tools.json`, installed `@nuxt/test-utils` APIs.

Use the existing form helper to demonstrate a real behavior worth testing, not Nuxt's own plumbing.

Required outcomes:

- A field-validation failure reaches the form's field-error state.
- Pending state resets on failure and success.
- A later successful submission clears obsolete field errors and executes the success behavior.
- Non-field failures follow the existing user-feedback contract.
- Pure unit tests remain in the fast Node environment; runtime tests have deliberate discovery and TypeScript ownership.
- Both the local check command and `pnpm verify` actually run the new tests; a Vitest project split must not silently drop existing unit tests.

**Proof:** run the new state-transition cases and the existing units. Use official test-utils with installed-version APIs; avoid a test whose only assertion is that an auto-import, mock echo, or forwarding call exists.

`happy-dom` and `@vue/test-utils` are installed devDependencies with no current usage in the repository; `mountSuspended` from `@nuxt/test-utils` needs both. If this workstream is ever dropped, remove those two dependencies instead of leaving them unused.

### 8. Strengthen public-response privacy coverage

**Start:** `server/utils/posts.ts`, `shared/types/api.ts`, `tests/unit/schema-drift.test.ts`, `tests/e2e/security.spec.ts`.

Structural TypeScript permits additional properties. The existing privacy test checks particular secret values in serialized mapper output; that is not an exact public-shape contract, and a handler can bypass the mapper.

Required outcomes:

- Assert the intended public response shape, including nested author fields, so newly leaked private fields fail even when their values change.
- Exercise the HTTP boundary, not just the mapper.
- Keep the public allow-list deliberate and consistent across the relevant list/detail responses.
- Preserve authorization checks and the existing 404-not-403 behavior.

**Proof:** show that adding a private author property to a response would fail coverage, then run the real API contract tests against a dedicated disposable E2E database. Do not add generic runtime response validation or universal Zod-to-Drizzle type comparison as part of this work.

### 9. Separate security audit feedback from quality verification

**Start:** `.github/workflows/ci.yml`, existing aggregate `ci` job and prose-only change filtering.

The audited job runs dependency auditing before verification, so an advisory can prevent independent quality feedback.

Required outcomes:

- Quality verification runs independently of advisory failure.
- High/critical advisories block integration; lower severities remain visible but do not block.
- Any exception is documented, narrow, and expires; do not add exceptions merely to obtain a green result.
- Audit execution failures remain failures, not successful clean reports.
- The aggregate required check includes the security outcome and preserves correct handling of failed dependencies and intentional prose-only skips.

**Proof:** exercise audit status handling for low/moderate, high/critical, and tool failure; inspect workflow dependency behavior and validate the final workflow in CI when authorized. Preserve independent verification output when the audit fails.

### 10. Refine agent and fork guidance

**Start:** existing repository guidance, `README.md`, owned `_docs/`, existing page skill and dependency-update configuration. Preserve context-file symlinks; never directly edit generated vendor trees.

Required outcomes:

- Clearly label official Nuxt mechanics versus template conventions.
- Explain that `useAsyncData(() => $fetch(...))` is valid; do not describe all setup-associated `$fetch` calls as forbidden.
- Preserve legitimate server-only components/plugins.
- Identify `useApiForm`, 422/404 contracts, and response mappers as template policies.
- Give forks a short setup checklist: required aggregate `ci` status, environment/E2E prerequisites, dependency automation activation, and documentation/skill resync after relevant upgrades.
- State that workflow files do not configure branch protection or activate external dependency services for a fork.
- Explain when production-build verification is necessary, without duplicating the canonical command inventory or creating another manual.

**Proof:** review instructions against actual scripts/configuration and link destinations. Update existing guidance rather than introducing competing conventions. Do not add a custom doctor command or automatically change GitHub settings.

### 11. Encode rules 10 and 11 as lint guards

**Start:** `eslint.config.mjs`, `shared/schemas/post.ts`, `server/api/posts/[id].get.ts`, the "Rules that are not guessable" list in `CLAUDE.md`.

Two rules that cost real debugging time are enforced only by prose today. Both have a syntactic shape that `no-restricted-syntax` can match with zero dependencies, in the same spirit as workstreams 5 and 6.

Required outcomes:

- In `shared/schemas/**`, a `.partial()` call whose receiver is a `*CreateSchema` identifier fails with a message that names rule 11 and the correct pattern (fields defined once without defaults, defaults applied only in the create schema). The existing `postUpdateSchema`, built from `postFields`, remains valid.
- In `server/api/**`, an object property `statusCode: 403` fails with a message that names rule 10 and says to return 404 so the row's existence is not confirmed. Nothing outside `server/api/` is affected; Better Auth's own responses are not touched.
- Both guards are errors in the local check, the uncached gate, and CI.
- Messages state the supported pattern, not just the prohibition.

**Proof:** positive and negative fixtures for each selector, including a `.partial()` on a non-create object (allowed) and a `403` outside `server/api/` (allowed). Keep scope honest: a selector matches syntax, not intent; a 403 produced through a variable or a helper is not caught, and the rule text should say so.

### 12. Make advisory Vue rules and import order actionable

**Start:** `eslint.config.mjs`, `nuxt.config.ts` (`eslint.config`), `CLAUDE.md` "Done means two things", `README.md`.

The Nuxt preset enables 27 `vue/*` rules at warning severity and `lint` runs with no warning cap, so an agent never sees them fail. A blanket zero-warning policy was rejected; three rules are promoted individually because each catches a real inconsistency:

- `vue/require-explicit-emits`: error.
- `vue/block-order`: error, with the preset's `script`, `template`, `style` order.
- `vue/define-macros-order`: currently not enabled; enable as error so `definePageMeta`/`defineProps`/`defineEmits` sit at the top of `<script setup>` in a fixed order.

`CLAUDE.md` states that `pnpm lint:fix` auto-fixes import order, but no ordering rule is configured. Resolve by adding the rule, not by removing the sentence:

- `import/order` (from `eslint-plugin-import-x`, already loaded by the preset) as an error with alphabetised groups; decide the group order for `#shared`, `~`, `node:` and relative imports deliberately and document it in the rule comment.
- Adoption is one autofix commit: the rule currently reports 37 findings in 21 files, all autofixable. Land that formatting change on its own so it does not hide inside another workstream's diff.

Required outcomes:

- All four rules are errors in the local check, the uncached gate, and CI; current code passes after the one-off autofix.
- `pnpm check` and `pnpm lint:fix` fix ordering; the documentation claim becomes true.
- The remaining 24 advisory `vue/*` rules stay advisory; do not add `--max-warnings 0`.

**Proof:** lint fixtures for a missing emit declaration, an out-of-order block, a misplaced macro, and an unordered import; confirm the autofix rewrites the import fixture. Run `pnpm verify` on the reordered repository.

### 13. Stop retrying E2E tests in CI

**Start:** `playwright.config.ts`.

CI retries a failed test once, which can turn a flaky test into a green run. The suite is small, single-worker, and runs against a built server, so a flake is a signal worth seeing.

Required outcomes:

- `retries` is `0` in every environment.
- Trace capture still happens on failure (the current `on-first-retry` setting captures nothing once retries are `0`; switch to `retain-on-failure`).

**Proof:** a deliberately failing test fails the run once, with a trace artifact uploaded. Do not leave the failing test in place.

## Recommended implementation order

1. Fix the observable page and Docker probe defects; add browser-error detection; set E2E retries to zero (workstreams 1, 2, 4, 13).
2. Land the `import/order` autofix commit on its own (workstream 12, first half).
3. Add targeted lint and severity enforcement, resolving real boundary findings (workstreams 3 and the rest of 12).
4. Add the four bounded convention guards with valid/invalid fixtures (workstreams 5, 6, 11).
5. Add form-state and response-privacy coverage without losing existing test discovery (workstreams 7, 8).
6. Separate audit execution and update the aggregate gate (workstream 9).
7. Update fork/convention guidance to match the implemented behavior (workstream 10).

This is sequencing guidance, not permission to silently drop any selected item. Shared mutation points include ESLint configuration, Vitest configuration, and CI YAML: serialize those edits or use isolated workspaces with an integration owner.

## Verification and integration requirements

Follow current repository instructions rather than treating this document as an override:

- Run file-scoped `pnpm check` after edits and `pnpm verify` before declaring implementation complete.
- Stop the dev server before Nuxt preparation/typechecking; those commands mutate the same `.nuxt` tree.
- Run the actual changed page, API, CLI, and runtime image as appropriate. Static checks are not behavioral proof.
- Build before production E2E execution. Use only an explicit disposable `E2E_DATABASE_URL` ending in `_e2e`; never reset an existing database.
- Preserve worthwhile regression tests for demonstrated bugs; avoid source-text and incidental-wiring assertions.
- Remove throwaway probes and failure-injection scaffolding after verification.
- Record evidence and review findings in Backlog. Leave implementation tasks In Review until verified, reviewed, and integrated on main.
- Commit finished, verified, reviewed work per the integration default above. Pushes, remote settings, and release publication require the appropriate authorization. Do not claim a release from local checks alone.

## Review record and evidence limitations

The proposal received a full default second-opinion panel: four reviewers completed, all returning `HAS_GAPS`. Their main corrections were to prioritize observable behavior, narrow static boundaries, specify severity/test-discovery mechanics, and strengthen response privacy. The revised scope above incorporates those corrections.

A disputed claim that unsafe-value lint would not work inside Vue SFCs was checked directly: an in-memory SFC expression using an unsafe parsed value produced both unsafe-call and unsafe-member-access diagnostics.

Historical audit evidence: existing lint passed and all 60 unit tests passed. These are baseline results, not proof of the proposed behavior. The audit did not establish a fresh full verification/build/E2E result for these improvements, because none had been implemented.

### Second audit (2026-09-21)

An independent audit by a different session, carried out before reading this document, confirmed workstreams 1, 2, 5, 6 and 9 from the code and found the gaps that became workstreams 11 to 13. Evidence gathered then, all on the unchanged repository:

- `pnpm verify` passed 5/5 (typecheck 5.9s, lint 10.9s, test 1.8s, migration freshness, vendored docs) with zero lint warnings.
- The effective ESLint rule set for a page is 290 enabled rules (135 `vue`, 65 `@stylistic`, 32 `@typescript-eslint`, 5 `import`, 2 `nuxt`); 27 `vue/*` rules are at warning severity; `reportUnusedDisableDirectives` is at warning severity.
- `import/order` with alphabetised groups reports 37 findings in 21 files, every one autofixable.
- A trial `complexity` cap of 15 fails six existing functions: `server/lib/auth.ts` `loadAuthConfiguration` (58) and a hook (16), `app/composables/useAuthSession.ts` `projectAuthSession` (21), the `server/api/auth/[...all].ts` handler (21), and two functions in `server/utils/logger.ts` (17 each). The rule was dropped on that evidence rather than adopted with exemptions.
- `happy-dom` and `@vue/test-utils` have no usage outside `package.json`.

The workstreams added by that audit (11, 12, 13) were chosen in a user interview but were **not** sent through the second-opinion panel. The implementing session may do so before starting them if the risk seems to warrant it.

Rejected or deferred additions:

- Blanket setup-level `$fetch` prohibition.
- Blanket app-to-server bans that reject valid Nuxt server-only surfaces.
- Universal `.parse()` bans or generic schema/database type comparison.
- Package-name searches in minified bundles as boundary enforcement.
- Additional application architecture, custom doctor tooling, process locks, broad browser matrices, coverage targets, or large inspection platforms without a demonstrated need.
- Optional axe/accessibility tooling, actionlint, and additional owned-file formatting: none selected in the interview.
- Git hooks (pre-commit or pre-push): rejected in the follow-up interview. `pnpm verify` plus the required `ci` check is the gate; hooks add a dependency and slow agent iteration.
- `knip` for unused exports, files and dependencies: rejected in the follow-up interview as a new dependency needing Nuxt auto-import configuration.
- A cyclomatic `complexity` cap: rejected in the follow-up interview on the evidence above.
- `@typescript-eslint/no-non-null-assertion`: not selected; the one existing use is in `server/utils/session.ts`.
- A blanket `--max-warnings 0` policy: rejected in both interviews; three specific rules are promoted instead (workstream 12).

Official references (consult vendored installed-version documentation first):

- [Nuxt data fetching](https://nuxt.com/docs/4.x/getting-started/data-fetching)
- [Nuxt shared directory](https://nuxt.com/docs/4.x/directory-structure/shared)
- [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server)
