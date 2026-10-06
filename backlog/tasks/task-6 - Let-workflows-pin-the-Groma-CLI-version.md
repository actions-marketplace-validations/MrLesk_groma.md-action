---
id: TASK-6
title: Control automatic and manual PR architecture comparisons
status: Done
assignee:
  - '@codex'
created_date: '2026-10-06 10:35'
updated_date: '2026-10-06 10:47'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/groma.md/pull/113'
modified_files:
  - action.yml
  - README.md
  - examples/pull-request.yml
  - examples/pages.yml
  - .github/workflows/check.yml
  - publish/action.yml
  - publish/publish.mjs
  - test/publish.test.mjs
  - .github/workflows/groma-demo.yml
type: bug
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Action follows a moving v1 tag but hardcodes its Groma CLI version. Updating the Action can therefore change the architecture reader without a workflow change. Groma PR #113 reproduced this when a newer reader rejected its saved older architecture. Let repositories choose their reader version independently of Action updates; preserve validation of both committed snapshots.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A workflow can select a Groma CLI version independently of the Action reference; omitted input retains the current default.
- [x] #2 The PR and Pages examples pin their reader version and explain that both revisions must use a readable architecture format.
- [x] #3 The Action checks verify a default-version build and an explicit-version comparison with the existing source and scanner-isolation assertions.
- [x] #4 The fork PR workflow keeps the trusted base checked out and fetches the PR commit only as comparison data, with checkout v7 protections enabled.
- [x] #5 Fork PRs do not export automatically; a maintainer can select a PR with Run workflow and publish the resulting comparison.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add groma-version to the composite Action and pass it as a quoted environment value to npm installation. Keep the default at 0.6.5.
2. Pin 0.6.5 in the published examples and explain explicit upgrades and same-reader requirements in README.
3. Extend the existing Check integration flow to select 0.6.6 for its comparison after using the 0.6.5 default for its map. Assert the installed CLI version at each stage. Authority: reproduced implicit-reader upgrade; wrong result: input ignored. Existing unit tests cannot observe installation; reuse the real Action CI instead of source-text tests.
4. Run npm run check, review the small configuration change, and verify the GitHub Check workflow. This is delivery configuration: OKF Markdown and C4 semantics remain owned by Groma, with no new architecture metadata or compatibility reader.

Reproduced additional failure: checkout v7 refuses PR #113 head under pull_request_target (run 37451040362). Change the reusable PR example to check out its base commit and fetch the requested head without checking it out. The exporter already reads both snapshots from Git; it needs no core change. Extend the existing integration setup to return to the before commit before export. Wrong result: comparison accidentally reads the working checkout instead of its requested head. The existing source-diff assertion must still observe the after commit. This stays within the requested permanent fix for other repositories.

User approved manual comparisons for external PRs after review, like manually starting CI. Add a workflow_dispatch PR-number input and restrict the automatic event to same-repository heads. Resolve the selected PR through GitHub before checkout. Pass its number and exact base explicitly to the publisher so both event types use the same publication path and existing stale-build checks. Extend publish tests with a real temporary comparison artifact: manual identity must target the selected PR and reject a changed head or base. Existing tests do not exercise publisher context, which currently requires pull_request_target. No separate approval persistence or new export parser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation uses the existing install step and scanner cache. The selected version crosses the YAML-to-shell boundary through an environment variable and stays one quoted npm package argument. No model parsing or fallback was added. Own specification/quality review found no blocking issue; all 17 Node tests pass. GitHub integration will exercise both versions before finalization.

Final own specification and quality review: workflow-supplied versions remain one quoted npm argument, existing cache keys use the actual installed version, and no PR scripts or scanner hooks run in comparisons. The reusable example checks out only the trusted base and fetches the head as Git data. All 17 Node tests pass. GitHub Check runs 37451313962 and 37451319745 pass on b77da940, verifying both installed versions and exported head source diffs while the checkout stays at the base. No core, OKF, or C4 change is needed.

User explicitly chose manual maintainer runs for fork PRs. Final supported flow: same-repository events or a workflow_dispatch PR number enter selection; GitHub supplies exact base/head; base is checked out; the requested commits export; publisher receives the selected PR/base and refuses stale head/base. Final own specification and quality review passed. All 20 Node tests and Check runs 37451938771/37451943638 pass on 7093f81. The unchanged historic demo remains pinned to its original Action, so no caller change was needed there.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Same-repository PRs compare automatically; external forks require a maintainer to use Run workflow with the reviewed PR number. The reusable example keeps the trusted base checked out and the publisher verifies that the selected head and base are still current. Explicit groma-version pins the reader independently of Action updates. All 20 Node tests and integration CI pass, including manual selection, stale-commit rejection, different checked-out/exported revisions, and scanner isolation.
<!-- SECTION:FINAL_SUMMARY:END -->
