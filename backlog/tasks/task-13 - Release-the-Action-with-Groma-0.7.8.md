---
id: TASK-13
title: Release the Action with Groma 0.7.8
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25T19:08:00Z'
updated_date: '2026-10-25T19:44:00Z'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/groma.md/releases/tag/v0.7.8'
  - action.yml
  - .github/workflows/check.yml
modified_files:
  - action.yml
  - README.md
  - CONTRIBUTING.md
  - .github/workflows/check.yml
  - backlog/tasks/task-13 - Release-the-Action-with-Groma-0.7.8.md
type: chore
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Groma release checklist requires the Action default to adopt each successfully published CLI hotfix. This release carries the component-move and Unicode-ID fixes from Groma 0.7.8.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Action default, README and release checklist use Groma 0.7.8, and real CLI smoke checks require that version.
- [x] #2 The local check suite and exact-candidate Windows, Linux and macOS checks and real CLI smoke pass after Groma 0.7.8 is published.
- [x] #3 One stable Action patch release is published from the tested commit and its release workflow advances v1 after all checks pass.
- [ ] #4 The Action release is published to GitHub Marketplace as required by the release checklist.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update the existing Groma CLI version pin, README and concrete release checklist from 0.7.7 to 0.7.8. Update the existing real export/comparison smoke commands to require 0.7.8; keep their scenarios, trust boundaries, arguments and assertions unchanged.
2. No new tests: the supported release rule comes from groma.md CONTRIBUTING.md and this repository release checklist. The concrete failure would be an Action release that still installs the prior CLI or cannot export/compare using the published hotfix. Existing local checks and the three-platform real CLI smoke already detect that flow; changing their selected protocol version closes the current release gap without another harness.
3. Run npm run check with the declared Node/npm tools. After npm confirms Groma 0.7.8, publish this one-task candidate PR and verify all exact-commit checks, including the real export/comparison matrix. Perform own specification/quality review for this small pin update.
4. Merge the tested candidate, confirm the merge tree matches it, create one stable v1.2.4 GitHub Release from that commit, verify the release-published Check workflow and v1 pointer, and complete Marketplace publication if the UI allows it. Do not manually push tags or alter trust/runtime behavior.

Prepare the version-pin PR as a draft while CLI publication runs. The existing workflow explicitly skips real npm smoke for draft preparation. Mark it ready only after npm confirms 0.7.8, then verify the exact candidate including the real smoke matrix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Local npm run check passed all 62 tests with Node 26.12.1 and npm 12.2.1; git diff --check passed. This small update changes only the CLI version pin, README/checklist versions and the existing smoke commands selected CLI version. No assertions, runtime logic, trust policy or scenarios changed. Implementer specification/quality review of the pin change found no blocker; exact-candidate CI and publication are still pending. No new tests or separate architecture/simplicity agents are needed for this constant-and-documentation update.

Groma v0.7.8 release 40224391938 passed all jobs, published all five platform packages and the wrapper, attached five binaries plus SHA256SUMS, and synced main to 0.7.8. npm confirms the exact wrapper and platform versions. A temporary install with lifecycle scripts disabled reports 0.7.8 and successfully creates/resolves the Unicode actor Студент / студент. The initial package/platform 404 responses cleared as registry metadata became available; no source changes or extra release were made. The required post-release architecture workflow 40226265844 passed, including PR186 comparison.
Action candidate b0f615f passed all six unit and real npm/export/comparison gates on Windows, Linux and macOS in 40226263430. PR12 merged as 52a5085b63352de92ae1bea052d069b6bd0b3553; its tree exactly equals the tested candidate tree 546e1d424e7b71816ed4f4d6355c71c0d08bd905. Stable GitHub Release v1.2.4 is published at https://github.com/MrLesk/groma.md-action/releases/tag/v1.2.4. Release run 40226808215 repeated all six gates successfully and its release-tag job advanced v1 to exactly 52a5085b63352de92ae1bea052d069b6bd0b3553. No raw tag push, extra release, package-version bump or runtime/trust change was made.
Marketplace publication remains pending, so the task stays In Progress. The public v1.2.3 page has the release Marketplace badge; v1.2.4 does not. Browser startup fails before page access with Importing module node:process is not allowed; resetting the control session did not fix it. The Computer Use runtime also could not load. The user explicitly requested the agent finish through the browser; no Marketplace UI change or verification was performed. A working browser-control connection is needed to edit this existing release, enable Publish this Action to the GitHub Marketplace, and save it. This remaining gate comes from CONTRIBUTING.md Releases, not a new product requirement.
<!-- SECTION:NOTES:END -->
