---
id: TASK-8
title: Release quality safeguards as v2.2.0
status: In Review
assignee: []
created_date: '2026-09-21 11:53'
updated_date: '2026-09-21 12:04'
labels: []
dependencies: []
type: chore
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User authorized commit, push and stable release of the completed quality-tooling improvements. Publish the compatible feature release without moving existing tags or bypassing CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Package version is 2.2.0 and local verify plus production E2E pass.
- [ ] #2 Release commit is on origin/main with successful verify, audit, e2e, docker and aggregate ci jobs.
- [ ] #3 A named stable v2.2.0 GitHub release points to the verified immutable tag.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Prepare 2.2.0 from clean main using the release script; write notes; verify with a disposable E2E database; review and commit; push and wait for exact-commit CI; publish with the release script; record publication and close the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prepared package version 2.2.0 with the existing release script. Release-candidate pnpm verify passed all five gates: 71 tests across 8 files. Fresh production build and pnpm test:e2e passed all 29 browser/API tests and controlled authentication regressions (including 25 startup/transport scenarios). Reviewed the minor-version choice and release notes against the approved compatible scope; no additional implementation changes. Awaiting exact-commit remote CI and publication.

First remote CI run 35596882553 failed only verify: the direct-import lint integration test exceeded the default 5000ms while initializing the shared TypeScript project and exercising boundary fixtures. Apply the existing 30-second typed-project allowance to this test as well, preserving all assertions and zero retries; rerun local check/verify and require fresh exact-commit CI before publishing.

Corrected the shared-project lint integration test to use the existing bounded 30-second TypeScript startup allowance; assertions and retries are unchanged. Reviewed the test-only correction. pnpm check tests/unit/lint-guards.test.ts and pnpm verify both passed (71 tests, eight files; all five verify gates). Production behavior is unchanged; new remote CI must pass before publication.
<!-- SECTION:NOTES:END -->
