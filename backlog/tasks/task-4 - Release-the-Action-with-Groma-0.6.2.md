---
id: TASK-4
title: Release the Action with Groma 0.6.2
status: Done
assignee:
  - '@codex'
created_date: '2026-10-05 05:00'
updated_date: '2026-10-05 05:30'
labels: []
dependencies: []
modified_files:
  - action.yml
  - README.md
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Groma 0.6.2 release requires the public Action to use the new CLI version. The current Action still installs 0.6.0. Complete the post-release checklist without changing the build or publication behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Action installs Groma 0.6.2 and the README states the same version.
- [x] #2 Local checks and the Check workflow pass on the exact Action release commit, including current-map and committed-comparison exports.
- [x] #3 Action v1.0.1 is published and the v1 pointer targets that tested release.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wait for the Groma 0.6.2 Release workflow and confirm the exact npm package. 2. Update the action.yml pin and README version, using existing tests and the integration Check workflow without adding tests for version text. 3. Commit and push, verify that exact commit in CI, publish Action v1.0.1 with the format-change note, and move v1 to the tested release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The root composite Action installs Groma 0.6.2, and the README names that exact version. Existing examples already use @v1. The change affects two version strings and leaves build, export and comparison behavior unchanged. The CLI installation step remains the single owner of the version pin.

Groma release workflow 37265828827 passed on all five build hosts. All 24 expected exact npm versions and all six CLI tarballs are available. An isolated macOS npm install reports 0.6.2 through both its binary and Node wrapper, and the binary matches the GitHub release checksum. Fresh scanner installation and second-checkout restore passed on the existing acceptance projects.

Local npm run check passed all 17 tests on Node 24.11.1; git diff --check passed. Check workflow 37267515544 passed on exact commit 8ba8ddb125dd56b73b5d59b53a66f537cffc8aac, including current-map export and committed comparison without executing a PR scanner. Its first attempt encountered a still-processing Linux npm tarball; the unchanged commit passed after that canonical tarball became available. No test, retry policy or runtime behavior was changed.

Specification and quality reviews pass. The version pin and its documentation agree, existing integration tests prove the supported flows, and no new test for version text is needed. Action v1.0.1 is published at https://github.com/MrLesk/groma.md-action/releases/tag/v1.0.1. Both v1.0.1 and v1 resolve to 8ba8ddb125dd56b73b5d59b53a66f537cffc8aac. The public Marketplace page https://github.com/marketplace/actions/groma-md-architecture-map displays v1.0.1 as Latest, so no additional browser publication step is required. Release notes explain Groma 0.6.2 relationship storage and the effect on older committed architecture.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released Action v1.0.1 with Groma 0.6.2 and moved @v1 to the exact tested commit. All 17 local tests and the current-map and committed-comparison integration checks pass. GitHub Marketplace shows v1.0.1 as latest. Release notes explain the relationship format change, including comparisons of older commits.
<!-- SECTION:FINAL_SUMMARY:END -->
