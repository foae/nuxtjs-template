---
id: TASK-6
title: Document approved quality tooling handoff
status: Done
assignee: []
created_date: '2026-09-21 10:43'
updated_date: '2026-09-21 11:11'
labels: []
dependencies: []
documentation:
  - _docs/quality-tooling-handoff.md
type: docs
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Preserve the quality audit and user-selected improvements as a self-contained handoff for a future implementation session, without implementing the proposals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Owned handoff document captures every selected improvement and excluded optional addition.
- [x] #2 Each workstream includes starting files, observable acceptance criteria, and verification requirements.
- [x] #3 Document distinguishes historical evidence from pending implementation and records scope and review decisions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Write _docs/quality-tooling-handoff.md from the completed audit and interview; review against every selected option; run repository checks and record results, leaving the task In Review until integration.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewed the handoff against all seven interview answers: all selected workstreams are captured, optional additions remain excluded, and each workstream has source entry points and behavioral acceptance/proof requirements. Historical audit evidence is explicitly separated from unimplemented proposals. Documentation-only change; no application behavior changed. pnpm check _docs/quality-tooling-handoff.md passed typecheck and 60 unit tests (Markdown lint correctly skipped); pnpm verify passed all five gates. Remains In Review pending integration; no implementation proposals executed and no commit/push performed.

Amended after an independent second audit and follow-up interview (same day). Added workstreams 11 (rules 10/11 as no-restricted-syntax guards), 12 (promote vue/require-explicit-emits, vue/block-order, enable vue/define-macros-order as errors; import/order autofixable error reconciling the CLAUDE.md claim; 37 autofixable findings in 21 files), 13 (E2E retries 0 with retain-on-failure traces). Recorded an integration default (commit finished, verified, reviewed work to main unless a workflow skill applies). Rejected on evidence: complexity cap (six existing functions exceed 15, auth loader at 58), knip, git hooks, no-non-null-assertion. Noted happy-dom and @vue/test-utils are currently unused and depend on workstream 7. Baseline evidence on unchanged repo: pnpm verify 5/5, zero lint warnings. Workstreams 11-13 were not sent through the second-opinion panel; the document says so.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Handoff document written, amended after a second independent audit, and committed to main. Records 13 selected workstreams, an integration default, and rejected additions with evidence. No implementation performed.
<!-- SECTION:FINAL_SUMMARY:END -->
