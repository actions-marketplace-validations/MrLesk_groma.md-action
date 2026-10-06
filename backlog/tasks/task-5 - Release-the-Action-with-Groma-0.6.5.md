---
id: TASK-5
title: Release the Action with Groma 0.6.5
status: Done
assignee:
  - '@codex'
created_date: '2026-10-05 11:00'
updated_date: '2026-10-05 11:39'
labels: []
dependencies: []
modified_files:
  - action.yml
  - README.md
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex requested adoption of the Groma hotfix in the Action and its examples. The current major Action tag installs Groma 0.6.2 and misses the latest CLI fixes. Both published example workflows already use @v1, so updating the tested major-tag release carries the hotfix to them without changing their build or publication behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Action installs published Groma 0.6.5 and the README states the same version.
- [x] #2 Local checks and the Check workflow pass on the exact Action release commit, including current-map and committed-comparison exports.
- [x] #3 Action v1.0.2 is published and both example workflows use the v1 tag pointing to that tested release.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wait for Groma 0.6.5 publication and verify npm metadata. 2. Update the action.yml version pin and its README, preserve the examples that already use @v1, and run npm run check. Existing tests cover build inputs and publication; the real Check workflow covers the CLI current-map and comparison exports, so add no test for version text. 3. Commit and push, verify Check on the exact commit, publish Action v1.0.2 and move v1 to that tested release. No architecture, OKF metadata, C4 semantics or model compatibility changes are needed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Groma Release run 37300984928 passed. All five platform packages and the wrapper report 0.6.5 on npm; the GitHub release has five binaries and SHA256SUMS. A fresh isolated npm install reports 0.6.5 and its macOS binary matches the GitHub checksum.

The install step in action.yml owns the exact CLI version, and README documents the same version. Both now use 0.6.5. Both example workflows already use @v1, so no example files changed. Build and publication behavior, scanner configuration, OKF metadata and C4 semantics are unchanged.

npm run check passed all 17 tests under Node 24.11.1; log /private/tmp/groma-action-1.0.2-check.log. git diff --check passed. Check run https://github.com/MrLesk/groma.md-action/actions/runs/37303937206 passed on exact release commit 766bf95a1c51ff50f113aabaa843e30d6aa3758a, including current-map and committed-comparison exports and their existing verifiers. No test was added for version text; existing checks prove the supported results.

The implementer's specification and quality reviews pass. The change is a CLI pin and matching documentation, with clear ownership in the install step. The supported export flows pass without added code, dependencies or tests.

Action v1.0.2 is published at https://github.com/MrLesk/groma.md-action/releases/tag/v1.0.2. Both v1.0.2 and v1 resolve to 766bf95a1c51ff50f113aabaa843e30d6aa3758a. The major tag update used a lease against the previous tag to protect concurrent changes. The public Marketplace listing shows v1.0.2 as latest; no additional browser publication step was needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released Action v1.0.2 with Groma 0.6.5 and moved @v1 to the exact tested release commit. All 17 local tests and the GitHub current-map and committed-comparison checks pass. Marketplace shows v1.0.2 as latest. Both examples receive the hotfix through their existing @v1 references.
<!-- SECTION:FINAL_SUMMARY:END -->
