---
id: TASK-9
title: Prepare the Action for Groma 0.7
status: Done
assignee:
  - '@codex'
created_date: '2026-10-17 05:12'
updated_date: '2026-10-17 19:12'
labels: []
dependencies: []
references:
  - action.yml
  - prepare.mjs
  - .github/workflows/check.yml
modified_files:
  - prepare.mjs
  - scan.mjs
  - action.yml
  - test/fixtures/project/groma/scanners.json
  - test/fixtures/project/groma/config.json
  - test/prepare.test.mjs
  - test/scan.test.mjs
  - test/comparison.test.mjs
  - README.md
  - examples/pages.yml
  - examples/pull-request.yml
  - .github/workflows/check.yml
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Groma 0.7 replaces scanner configuration and management commands. The Action must scan and export upgraded projects while committed comparisons remain independent of project plugins. Prepare the PR now; merge and move the Action release tag only after Groma 0.7 is available on npm.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single-checkout publication uses config.json and Groma 0.7 plugin commands while preserving project scanner settings and work-source choices.
- [x] #2 A publication finishes its chosen scanner updates before scanning and exporting, with no detached update racing the export.
- [x] #3 Committed comparisons read committed architecture and source without installing or executing project plugins.
- [x] #4 The default CLI, examples and checks target Groma 0.7; the prepared PR stays unmerged until the CLI is publicly installable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace scanners.json and obsolete commands directly with config.json and Groma 0.7; no old-format adapter. Preserve scanner includes/settings, global exclusions and Backlog selection.
2. Prepare the CI working config with automaticUpdates false so the scan/export is settled. A single-checkout scan restores missing plugins, explicitly updates configured npm scanners (including a warm cache), checks readiness, scans once and exports. Git/local declarations remain unchanged. Committed comparisons keep their existing architecture-only path.
3. Extend existing prepare tests to exercise config.json, preserved operational settings, exclusions and package cache identity; add minimal command-sequence coverage for explicit npm updates finishing before scan/export. The old action reproduced ENOENT scanners.json and unknown scanner install; these changes close that coverage gap.
4. Default and examples use 0.7.0. Keep ordinary PR unit checks runnable before publication; run the real npm installation smoke on main or manual release validation once 0.7.0 exists. Before then, exercise the action scripts locally with the compiled release candidate and record that distinction.
5. Run repository checks and implementer specification/quality review, open a draft PR with this task and the repository template. Hold merge and Action release tag changes until public Groma 0.7 installation passes.

Draft PRs run unit checks on Windows, Linux and macOS. The existing real npm/action smoke runs on a ready PR, main push or manual run; ready_for_review triggers it. Thus this pre-release draft stays green without removing full smoke coverage from future ready PRs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation uses config.json and 0.7.0 directly. The CI working copy disables automatic background updates, then scan.mjs restores missing plugins, updates each configured npm scanner and completes one check/scan/export sequence. Git/local sources stay declared and committed comparisons keep the empty temporary root. Local checks pass28 Node tests; preparation preserves scanner settings/workSources and literal exclusions. Public npm smoke is held until Groma0.7.0 exists. Source/quality review finds clear ownership in prepare, scan and comparison scripts; no compatibility adapter or new public Action input was added.

Final local unit/source checks pass:28 Node tests, no skips; node --check prepare.mjs and scan.mjs; git diff --check. Existing comparison tests verify no project plugin configuration in the temporary export root on success and failure. Required public Groma0.7 installation smoke stays pending, so this task remains In Progress and its PR will be draft. Final candidate integration and real action flow will be qualified before release coordination.

The first Windows run exposed an existing assertion that compared Git forward-slash paths with Windows backslash paths. Normalized the returned Git directory with path.resolve; the test still checks the exact repository directory and both export success/failure paths. Linux and macOS passed before this correction. No assertion or workflow check was removed.

Current source e31b999 passes Windows, Linux and macOS CI. Candidate end-to-end qualification with the actual standalone Groma0.7 binary passes fresh and warm-cache prepare/install/update/scan/export. Export includes only selected source and source bytes stay unchanged. Committed comparison from the base checkout reports the expected code change without executing a deliberately failing local scanner or changing project config. Repeated on final combined candidate e7149d27 (/tmp/groma-action-task9-e2e.log and results.json). Implementer specification/quality review confirms prepare owns CI configuration, scan owns the settled plugin/scan/export sequence and comparison remains independent. Public npm0.7 smoke and release-time merge remain pending; PR8 stays draft.

Groma v0.7.0 is published, and its Linux x64 npm wrapper and platform tarballs are publicly downloadable. Manual Check run 39061382617 now tests the unchanged candidate 9fa29bc against the real public npm release, including all three unit-test hosts and the Action publication/committed-comparison smoke. PR8 remains draft and unmerged until this public installation gate passes.

Public release gate passed: manual Check run 39061382617 at 9fa29bc040d0a701862b7c108215d5b72f5183b9 succeeds on Windows, Linux and macOS, plus release-smoke. The Linux smoke installs actual public groma.md@0.7.0, runs the Action scan/export, verifies selected source and exclusions, then compares committed snapshots from the base checkout while a hostile project scanner remains unexecuted and config unchanged. All six CLI npm package tarballs are now publicly downloadable. PR8 has remained unmerged through this gate; it can now become ready and merge after checks on the final task-record commit. No runtime code changed since the qualified candidate. Implementer specification and quality review is complete; prepare owns config, scan owns completed install/update/scan/export, and comparison exports committed snapshots independently.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prepared the Action for Groma 0.7 and config.json. Current-map publication restores and updates npm scanners before scan/export while preserving project settings. Committed comparisons do not execute project plugins. Documentation and the default CLI now use 0.7.0. All 28 unit tests pass on Windows, Linux and macOS; public npm installation, export and committed-comparison smoke pass in run39061382617. Merge and v1.2.0/v1 release remain gated by CI on the final record commit.
<!-- SECTION:FINAL_SUMMARY:END -->
