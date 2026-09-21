---
id: TASK-8
title: Release quality safeguards as v2.2.0
status: In Review
assignee: []
created_date: '2026-09-21 11:53'
updated_date: '2026-09-21 11:58'
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
<!-- SECTION:NOTES:END -->
