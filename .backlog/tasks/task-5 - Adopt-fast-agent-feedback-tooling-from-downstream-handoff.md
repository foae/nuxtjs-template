---
id: TASK-5
title: Adopt fast agent feedback tooling from downstream handoff
status: In Review
assignee: []
created_date: '2026-09-20 08:03'
updated_date: '2026-09-20 11:01'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upstream the reviewed downstream tooling handoff: include tooling in TypeScript project references, provide a scoped post-edit feedback command, preserve cold verification lint, and centralize reliable agent workflow guidance. Adapt to the existing uncommitted Better Auth migration without replacing or staging it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tools and tests are checked through the last root TypeScript reference; prepare preserves the root config and build metadata stays ignored.
- [x] #2 pnpm check safely fixes literal in-repository paths, warns for deleted paths, refuses external paths, and runs full typecheck and unit tests despite an earlier failure.
- [x] #3 Cached fix commands leave pnpm verify and CI lint uncached; measured cache and scoped-check results are recorded.
- [x] #4 Agent guidance, page skill and README document fast feedback, captured dev output, safe E2E invocation and one complete script inventory.
- [x] #5 pnpm verify and production build pass; deliberate type failures and fresh language-server diagnostics are exercised, with limitations explicitly recorded.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review current TASK-5 implementation and documented acceptance evidence. 2. Exercise actual scoped-check success/failure paths and run verification. 3. Resolve findings, record acceptance review, and commit implementation on main. 4. Prepare a compatible minor release, run verify and full E2E, commit task finalization and version, push main. 5. Require exact-commit green CI, publish and verify the stable release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation and local verification complete. Added pnpm check with literal argv, containment checks, cached autofix and non-short-circuiting full typecheck/unit tests. Root tools reference is last; nuxt prepare preserved tsconfig.json byte-for-byte and build metadata is ignored under node_modules/.cache. Canonical guidance, README and page skill updated; all 27 scripts are documented. Existing auth changes preserved; AGENTS.md remains a symlink. No commit, staging, push, integration or release performed.

Acceptance review passed. pnpm verify:full exited 0 in 32.20s: all five verification checks, 53 unit tests, and production build passed. Deliberate script/test TS2322 and no-console failures produced exit 1 while units still ran; fresh LSP reported the script error and cleared after removal. Server/Vue/script/unit/deleted/mixed/no-argument checks passed; literal spaces/semicolon filename autofixed; external and symlink escapes refused without mutation. Temporary probes removed and source hashes preserved. Cold lint:fix 10.12s, warm 0.89s; same-Vue cached check 8.33s; mixed-file check 8.48s. First Vue check 11.03s, so sub-10-second performance is not guaranteed. CLI output proves final lint remains eslint . without cache. Evidence and verbatim summary boxes: .private/task5-tooling-evidence.txt; isolated adoption diff: .private/task5-tooling.diff. E2E discovery listed 24 tests; no E2E execution success claimed for this tooling task. A mistaken extra separator earlier invoked setup against a nonexistent dedicated disposable DB and failed safely; corrected documented invocation and submitted friction 757. Nonblocking generated Rollup annotation warning at node_modules/.cache/nuxt/.nuxt/dist/server/_nuxt/head-2OAPZgtv.js:28029:30: comment removed, build succeeded. Remains In Review pending integration on main.

Independent implementation review completed (Opus, GLM, Sol, Terra; all four returned). Acceptance #2 reopened: a temporary Node probe using installed ESLint confirmed directory-scoped autofix follows nested file symlinks and modifies a target outside the supplied directory; check.ts only validates supplied paths. Explicit empty-string input also resolves to the repository root. Additional validated concerns: unbounded dev readiness polling, raw-log permissions, all-missing lint reported as passed, piped-output exit handling, cached recovery hint, and shared Nuxt generation concurrency risk (source-verified; no dev malfunction reproduced). Complete finding dispositions: .private/task5-review-validation.txt; panel artifacts: /home/blana/.cache/multi-llm-review/20260920-084131-3628514/. Telemetry submitted: id=758. No review-driven source edits; repairs await owner authorization. Working implementation remains uncommitted and nothing was pushed or released. During context restoration an authentication commit was mistakenly created, then immediately undone with soft reset and the index unstaged; working files were preserved.

Owner added a final step: compare the updated ~/Projects/agent-feedback.io/.private/handoff-nuxtjs-template-agent-tooling.md against the current implementation and review repairs; identify already-covered changes and import applicable improvements, then re-verify any imported changes.

Authorized review repairs and final updated-handoff comparison are implemented. Imported ignored/non-lintable path skipping, whole-tree warning, corrected five-project source comment, and scoped-check resource guidance; existing TypeScript references, cold gate, E2E invocation, inventory and harness notes already covered. Retained stronger compute-before-write symlink protection and canonical private/bounded startup recipe. Seven mutation/selection regressions pass; 60 total unit tests pass. Real CLI ignored-selection probe passes with SKIPPED lint; empty-path failure still runs later steps. Extracted startup recipe passed success, process-exit and 60-second hung-HTTP scenarios with mode 700 logs directory, mode 600 existing log, and unchanged caller umask. No dev failure reproduced; source-verified shared Nuxt generation is now explicitly serialized. Separate production build passes. CURRENT BLOCKER: pnpm verify:full fails migration tracking for existing untracked 0003/0004 SQL and snapshot files from TASK-4; typecheck, uncached lint, units and vendored check pass. Staging remains untouched as instructed. Acceptance 5 reopened; resume at final verify:full after authorized migration review/staging, then return to In Review. Detailed comparison and exact summaries: .private/task5-final-evidence.txt. No commit, push or release.

Blocker cleared with explicit owner authorization: staged only server/database/migrations/0003_graceful_unicorn.sql, 0004_massive_james_howlett.sql, meta/0003_snapshot.json and meta/0004_snapshot.json. Final pnpm verify:full succeeded in 32.54s: all five verification checks pass, including migration freshness; 6 unit test files and 60 tests pass; production build completes. Acceptance review: all five criteria now supported by this run and previously recorded behavioral/type-diagnostic probes; authorized review repairs and updated handoff imports are complete. Non-fatal build warning: generated Nuxt head chunk line 28028 contains a misplaced NO_SIDE_EFFECTS annotation; Rollup removes the annotation and completes the build. No source changes, migration application, database reset, commit, push, or release in this continuation. Remains In Review pending integration on main.

Owner explicitly authorized Ship on main for end-to-end delivery on 2026-09-20, superseding prior no-commit/push/release restrictions. No unrelated changes are authorized.

Final delivery review passed on 2026-09-20: inspected scoped lint compute-before-write containment, literal selection, skipped results, exit handling, five-project typecheck and uncached gate; prior panel findings are resolved. Fresh pnpm check on the three tooling/test files passed; pnpm check with an empty argument exited 1 while typecheck and all 60 tests still passed. Fresh pnpm verify passed all five gates. No additional source repairs required. Release target v2.1.0 for the compatible new pnpm check feature. E2E target is the configured distinct loopback app_e2e database.
<!-- SECTION:NOTES:END -->
