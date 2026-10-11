---
id: TASK-8
title: Export comparisons without project plugin configuration
status: Done
assignee:
  - '@codex'
created_date: '2026-10-11 10:35'
updated_date: '2026-10-11 10:39'
labels: []
dependencies: []
references:
  - prepare.mjs
  - comparison.mjs
  - action.yml
  - test/prepare.test.mjs
  - test/comparison.test.mjs
  - .github/workflows/check.yml
modified_files:
  - test/prepare.test.mjs
  - test/comparison.test.mjs
  - prepare.mjs
  - comparison.mjs
  - action.yml
  - .github/workflows/check.yml
  - README.md
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 118 compares commits on a branch where plugins.json replaced scanners.json. The action fails before export because it opens the obsolete scanner file. Comparisons read committed architecture and source; they must not require or execute configured project plugins.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Comparison preparation succeeds for an initialized project with plugins.json and no scanners.json.
- [x] #2 Committed comparisons export both revisions and change counts without loading project scanner hooks or changing project configuration.
- [x] #3 The released scan-and-export flow keeps working until the plugin CLI is released.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Separate comparison preparation from scan configuration. 2. Export comparisons in an empty temporary working root that reads the existing Git repository; it has no project plugins to load. 3. Extend existing preparation and comparison tests: detect missing-old-file failure, plugin execution, configuration mutation, and cleanup after failed export. Existing tests cover change counts and scanner suppression but require scanners.json. 4. Run npm run check and real exports with released Groma 0.6.6 and the plugin branch. 5. Push an action PR and update Groma PR 126 to its tested commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Node 24 check passed: 26 tests, zero failures. All three changed comparison regressions failed before implementation: preparation opened the missing old file, and export required a configuration path. Real released CLI 0.6.6 scan/install/check/export passed against the initialized fixture. Real comparison exports passed with released CLI 0.6.6 and source CLI from task-568-plugins-json, with a configured scanner that writes an execution marker; no marker was produced and plugins.json stayed byte-for-byte unchanged. Evidence: /tmp/groma-action-plugins-smoke-IovpGa. Exporting the exact commits from the failed PR 118 job also passed with CLI 0.6.6: 3b9be405 -> 1b737ef8, two components added and sixteen modified, relationships unchanged. Evidence: /tmp/groma-pr-118-comparison-fixed. git diff --check passed. Self specification and quality review found no blocking defect: prepare owns scan-only settings, comparison owns its temporary root and cleanup, Git owns revision reads, and the CLI owns comparison output. Tests prove output, isolation, unchanged configuration, and cleanup on failure. Existing scan commands and CLI default remain unchanged because the plugin CLI is not released.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Comparison preparation no longer opens scanner configuration. Export uses an empty temporary working root linked to the existing Git repository, so it reads committed architecture and source without project plugins or configuration rewrites. All 26 Node tests pass; released scanning, comparisons on released and plugin CLIs, and the exact failed PR 118 comparison pass. Scan mode remains on the released CLI until the plugin CLI is available.
<!-- SECTION:FINAL_SUMMARY:END -->
