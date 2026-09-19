---
id: TASK-3
title: Set default ticket workflow and completion gates
status: In Review
assignee: []
created_date: '2026-09-19 15:26'
updated_date: '2026-09-19 15:27'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply the interviewed defaults consistently so agents and humans use the same workflow for every change, including small fixes and documentation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board columns are To Do, In Progress, Blocked, In Review and Done in that order; new tickets default to To Do and TASK identifiers.
- [ ] #2 Every ticket passes through In Review; agents may complete after verification, review and merge to main, with release tracked separately.
- [ ] #3 Blocked is a separate status with the blocker recorded; documentation and actual CLI/browser behavior agree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Configure the five agreed statuses while preserving the existing TASK prefix and To Do default. Update canonical instructions and README with mandatory review, blocker handling and merge-before-Done semantics. Smoke-test CLI transitions and browser columns in an isolated fixture, run verification, review and commit implementation to main before completing the ticket; publish a separately gated patch release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification passed 5/5 with 61 unit tests. Isolated CLI smoke created TASK-1 in To Do and exercised In Progress, Blocked, In Progress, In Review and Done; only Done was terminal. Browser visual verification showed all five columns in the agreed order. Review: configuration preserves existing IDs and To Do default; canonical guidance and README agree on mandatory review, agent approval authority, merge-before-Done and separate publication; no automated transition enforcement is claimed. No material findings.
<!-- SECTION:NOTES:END -->
