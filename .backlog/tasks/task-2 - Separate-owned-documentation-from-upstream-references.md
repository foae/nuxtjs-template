---
id: TASK-2
title: Separate owned documentation from upstream references
status: Done
assignee: []
created_date: '2026-09-19 15:04'
updated_date: '2026-09-19 15:17'
labels: []
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user reserves _docs for project/product documentation and selected _vendor/nuxt for pinned upstream Nuxt references. The old docs directory must disappear without compatibility aliases or dangling generator, verification, CI or Docker references.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Owned decisions are under _docs/decisions and pinned Nuxt references regenerate under _vendor/nuxt with valid content manifests.
- [x] #2 All live instructions, links, scripts, CI classification and Docker exclusions use the new paths; no old-path compatibility tree remains.
- [x] #3 Verification, production E2E and Pro review cover the relocation before the stable release is published.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move owned decisions; update generator and verifier, CI filter, Docker exclusions, README and shared instructions; regenerate upstream docs at the new destination; verify manifests, stale references and runtime behavior; assess Pro review.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved owned documentation to _docs and generated Nuxt references to _vendor/nuxt; migrated generators, verification, CI classification, Docker exclusions and live references without aliases. Regeneration/manifests, relocation integrity, local links and actual CI classification branches passed. Verification passed all five checks and isolated production E2E passed 19 tests. Independent review found two stale comment paths, now corrected. Ready for release; publication is recorded by GitHub.
<!-- SECTION:FINAL_SUMMARY:END -->
