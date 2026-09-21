---
id: TASK-7
title: Implement approved quality tooling handoff
status: In Review
assignee: []
created_date: '2026-09-21 11:15'
updated_date: '2026-09-21 11:48'
labels: []
dependencies: []
documentation:
  - _docs/quality-tooling-handoff.md
type: enhancement
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the final user-approved thirteen-workstream handoff to make future agent-driven forks safer without additional architecture. Preserve all exclusions and legitimate boundary exceptions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Page errors, recovery, Docker database access and uncaught browser failures meet workstreams 1, 2 and 4.
- [x] #2 Targeted safety lint, direct import and validation guards, create partial and status guards meet workstreams 3, 5, 6 and 11 with valid and invalid fixtures.
- [x] #3 Runtime form transitions and exact public API privacy meet workstreams 7 and 8 without losing unit discovery.
- [x] #4 Independent security audit and aggregate gate meet workstream 9.
- [x] #5 Fork and Nuxt guidance meets workstream 10.
- [x] #6 Vue rule errors and separately committed import ordering meet workstream 12.
- [x] #7 Zero retries and retained failure traces meet workstream 13.
- [x] #8 Verification, behavioral probes and review pass before local main commits; no push or release without authorization.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
First adopt import ordering in a standalone verified commit before overlapping edits. Then implement disjoint page/E2E, runtime tests, CI, and lint guard slices under coordinator integration. Validate once edits settle, exercise production browser/API/auth and Docker success/failure paths, review all acceptance criteria, update existing guidance and commit verified work locally on main.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Import-order adoption: alphabetized builtin/external/internal/parent/sibling/index groups, explicit project aliases. Autofix changed imports in 20 source/test files plus ESLint configuration. Reviewed reorder-only changes; pnpm check and pnpm verify passed (60 unit tests). Landing this isolated formatting/configuration slice before other implementation.

Audit integration now prints the complete pnpm JSON report and gates high/critical counts independently from quality verification. Executed the exact workflow shell with pinned pnpm against a loopback controlled registry: low/moderate details printed with exit 0; high/critical exit 1; registry HTTP 500 exit 4. Real registry audit: zero advisories and exit 0. Release script now requires the audit job; controlled Git/GitHub stubs proved skipped/failed audit rejection and successful-audit continuation to a blocked tag stub (no remote mutation).

Built actual runtime and migration Docker targets; inspected runtime non-root app user and both default commands. Migrated dedicated empty quality_empty_e2e database. Exact workflow API/envelope shell passed with HTTP 200 and items=[], total=0, limit=20, offset=0. Same shell failed (exit 4, curl HTTP 500) against a missing dedicated database even though root SSR returned HTTP 200. Root SSR error HTML contained Unable to load posts and not No posts yet. Browser observation and screenshots visually confirmed distinct SSR error and successful-empty surfaces. Created/migrated missing disposable database afterward; API and rendered page recovered.

Integrated pnpm check passed with 71 tests across 8 files; pnpm verify passed all 5 gates. Two independent read-only reviewers assessed safety/runtime and behavioral/CI/guidance slices. Review found an overbroad app/**/*.server exception; narrowed it to Nuxt plugins and components. A regression failed before the fix for app/utils/database.server.ts and passed afterward, while real server-only surfaces stayed allowed. Cold TypeScript-project startup exceeded the first lint fixture timeout once; that integration fixture now explicitly allows 30 seconds for project loading. A temporary mapper-transform probe injected an author email with a new value and failed the exact public-shape test; probe removed. Opt-in uncaught browser-error probe failed exactly once with retained trace.zip and no retry; probe removed. Initial production suite exposed a pagination fixture assumption (newer rows displace the seeded post); fixed assertions to verify injected page-1 rows hide on failure and the seed returns on page-2 recovery. Final production suite in progress.

Final production build and pnpm test:e2e passed: 29 Playwright browser/API tests, 25 auth startup/transport scenarios, SES/capture checks, and controlled Google/GitHub/OIDC/SAML regressions. Retained failure trace identified the pagination accessible name as Page 2; selector corrected, and redundant page teardown removed so database cleanup always runs. All selected acceptance criteria reviewed against implementation and evidence; review findings resolved. Temporary injection configs, registry/release stubs and owned services removed or stopped. Handoff status now points to this implementation record. Remote GitHub execution and release publication were not performed or claimed.
<!-- SECTION:NOTES:END -->
