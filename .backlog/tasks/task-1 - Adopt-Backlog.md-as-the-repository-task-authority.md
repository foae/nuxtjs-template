---
id: TASK-1
title: Adopt Backlog.md as the repository task authority
status: Done
assignee: []
created_date: '2026-09-19 15:04'
updated_date: '2026-09-19 15:17'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user wants every requested repository change tracked durably, including small fixes, rather than relying on ephemeral conversation checklists. Keep one shared instruction source and use a local CLI/browser workflow without automatic commits or remote operations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fresh frozen install provides pinned Backlog CLI and localhost browser board through documented pnpm commands.
- [x] #2 Shared instructions require searching, tracking every requested change, acceptance criteria, plans, evidence and honest completion via the CLI.
- [x] #3 The actual CLI task lifecycle and browser board work; temporary smoke tasks are excluded from the repository.
- [x] #4 Mechanical verification, isolated E2E and the requested Pro review of completed changes have been assessed and material findings resolved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Install exact mature Backlog release; initialize .backlog without generated instruction files; add pnpm commands and shared workflow documentation; exercise CLI and browser; verify and review before marking complete.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added pinned Backlog CLI, terminal/browser commands and shared durable task workflow. Frozen install, real task lifecycle, localhost browser and tracked-files-only fresh-checkout smoke passed. Verification passed all five checks (61 unit tests); isolated production E2E passed 19 tests. Independent review assessed; documented Linux glibc requirement. Release publication is recorded separately by the immutable GitHub release.
<!-- SECTION:FINAL_SUMMARY:END -->
