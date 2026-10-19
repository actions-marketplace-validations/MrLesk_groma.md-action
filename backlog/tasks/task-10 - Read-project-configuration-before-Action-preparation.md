---
id: TASK-10
title: Read project configuration before Action preparation
status: Done
assignee:
  - '@codex'
created_date: '2026-10-19 12:06'
updated_date: '2026-10-19 12:12'
labels: []
dependencies: []
references:
  - action.yml
  - prepare.mjs
  - .github/workflows/check.yml
  - test/verify-export.mjs
  - 'https://github.com/MrLesk/Backlog.md/actions/runs/39224405955'
modified_files:
  - action.yml
  - README.md
  - .github/workflows/check.yml
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Projects initialized before Groma 0.7 still commit scanners.json. The Action reads config.json before any project-aware CLI command can apply the existing first-use conversion, so even the public 0.7 CLI fails with ENOENT. Backlog.md architecture run39224405955 reproduces the failure. The CLI already owns conversion; the Action must invoke it in the correct order rather than implement another converter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single-checkout publication with scanners.json and Groma 0.7 reaches scan/export using the converted configuration and preserves scanner settings and exclusions.
- [x] #2 Current configuration still completes scanner restoration and explicit npm updates before the scan/export.
- [x] #3 Committed comparisons retain their configuration-independent export path and do not execute project plugins.
- [x] #4 The supported minimum CLI version is clear, and the real public npm smoke exercises the old-configuration upgrade path.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In the single-checkout Action path, run the existing groma plugin list command before prepare.mjs reads config.json. The CLI owns the existing conversion; comparison runs bypass this configuration step. No new parser, compatibility layer or project initializer.
2. State that the Action requires Groma 0.7 or newer. Keep exact CLI pinning available within that supported range.
3. Extend the existing real public npm smoke fixture to start with old-format scanners.json and verify conversion plus the current map export. Authority: the reproduced Backlog.md ENOENT failure and the approved fix. Existing unit fixtures already have config.json, so they cannot detect the startup-order defect. This one integration scenario fails before the new CLI step and passes after it; existing unit/comparison coverage remains the authority for current settings and isolation.
4. Run npm run check, focused actual public CLI upgrade/export proof and the ready-PR public npm smoke with Windows/Linux/macOS checks. Review the final flow for scope, simple ownership and preserved comparison isolation.
5. Coordinate the separate Backlog.md workflow/configuration PR with its active agent. Prepare the Action patch release only after the fix is qualified. Operational configuration stays outside the OKF/C4 architecture model.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one single-checkout composite step: groma plugin list runs before prepare.mjs. The CLI applies its existing conversion; the Action does not parse scanners.json or add another converter. Comparison runs skip the step. README states the existing0.7 minimum. The existing public npm smoke now starts from scanners.json and checks that config.json exists and the old file is removed after a successful map build. npm run check passes28 tests. A local actual-public0.7 proof passes old-config conversion, fresh and warm-cache scan/export, source-byte preservation and committed comparison with a hostile scanner unexecuted and config unchanged. Receipt: /tmp/groma-action-task10-e2e-results.json; log: /tmp/groma-action-task10-e2e.log. Implementer scope/quality/simplicity review: the composite owns ordering, CLI owns conversion, preparation owns CI settings, and comparison keeps its separate export path. No new helper, dependency or compatibility layer is needed. Final Windows/Linux/macOS and real public npm CI remain the PR merge gate.

Action PR9 at b8a7793b2bfad784d6c75ff33c038c2d3dd78183 passes Windows, Linux and macOS unit CI plus the real public npm release-smoke. The smoke starts from scanners.json, successfully runs the CLI-owned conversion before preparation, restores/updates scanners, exports the expected selected source, and verifies config.json exists with the old file removed. It then passes the isolated committed comparison with a hostile project scanner unexecuted. AC1/4 are supported by this real regression smoke and the local actual0.7 proof; AC2 by the current/warm flow and update-order unit tests; AC3 by unit isolation tests and both real comparison proofs. Own specification, quality and simplicity reviews pass. Final task-record commit must retain green checks before merge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed Action startup ordering for projects with scanners.json. The single-checkout path asks Groma to read configuration before preparation, using its existing conversion. Comparisons keep their isolated path. Documented the Groma0.7 minimum and extended the existing real npm smoke to cover the reproduced upgrade failure. All28 unit tests, Windows/Linux/macOS CI, the real public npm upgrade/export/comparison smoke and local fresh/warm integration pass. No CLI-core change, duplicate converter or new dependency.
<!-- SECTION:FINAL_SUMMARY:END -->
