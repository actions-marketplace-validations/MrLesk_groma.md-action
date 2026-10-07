---
id: TASK-7
title: >-
  Publish the default-branch map beside PR comparisons, including private
  repositories
status: Done
assignee:
  - '@claude'
created_date: '2026-10-07 20:37'
updated_date: '2026-10-07 22:56'
labels: []
dependencies: []
modified_files:
  - publish/publish.mjs
  - publish/action.yml
  - examples/pages.yml
  - examples/pull-request.yml
  - README.md
  - test/publish.test.mjs
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A private company repository (FunstageGmbH/Buzzinga-web, GitHub Enterprise Cloud with public Pages disabled) wants a continuously published map of its default branch plus a before/after comparison per PR. Two gaps block it. The publisher refuses every private repository because previews were assumed public, although Enterprise Cloud can restrict a Pages site to readers of the repository. And a repository has one Pages site that each deployment replaces: the PR publisher owns it through the groma-previews branch, while the current-map example deploys its own artifact, so the two wipe each other.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A private repository publishes PR comparisons when its Pages site is private; a private repository with a public Pages site is refused before anything is pushed or deployed. Public repositories behave as before.
- [x] #2 The publisher stores a default-branch map at the site root (architecture/<theme>/) on the groma-previews branch without removing any pr-<number> preview, and PR publication keeps an existing root map.
- [x] #3 A map build that is no longer the default-branch head is not published, matching the stale-build check for PRs.
- [x] #4 The current-map example publishes through the publisher, the PR example no longer skips private repositories, and the README documents private Pages and a map with PR comparisons on one site.
- [x] #5 npm run check covers private visibility, map placement next to previews, and stale map builds.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. assertDedicatedPages: read the Pages site before the visibility check; refuse a private repository only when site.public is true.
2. Map mode in publish.mjs: an empty pull-request input publishes the default-branch map. publicationContext checks the built revision is still the default-branch head (same stale rule as PRs); storeSite replaces only architecture/ at the site root, PRs replace only pr-<number>/. The comment step becomes a link step that comments only for PRs.
3. publish/action.yml: add revision input (default github.sha), describe the empty pull-request mode, comment only for PRs.
4. examples/pages.yml builds then publishes through the publisher with the shared groma-pages concurrency group; examples/pull-request.yml drops the private-repository skip. The historic groma-demo workflow stays pinned and unchanged.
5. README: private Pages requirement, one site for map and PR comparisons, groma-previews holds both.
6. Tests in test/publish.test.mjs for visibility, map placement, and stale map builds; run npm run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: the visibility check reads the Pages site first and refuses a private repository unless site.public is false (a missing field is treated as public). An empty pull-request input selects map mode: mapContext requires the exported architecture/<theme>/index.html and the built revision to equal the default-branch head; storeSite replaces only architecture/ at the root, PRs replace only pr-<number>/; the link step comments only for PRs. Branch name and ownership marker unchanged, so existing preview branches keep working. npm run check: 25 tests pass. Local end-to-end run of publish.mjs store/link against a bare remote and a stub API (private repository, private Pages): the groma-previews branch kept pr-1 and gained architecture/auto, link printed the root map URL, and a non-head revision was skipped. Not verified on GitHub: deploy to a real private Pages site. Open point for the maintainer: a repository that already deployed the earlier pages.yml has a successful Pages deployment and no groma-previews branch, so its first run of the new example is refused by the existing-site check.

Final validation: npm run check 25/25. MrLesk/groma.md publishes through its own architecture.yml (one deploy of every map, no groma-previews branch), so this change does not affect it; the existing-site refusal on first publish applies only to a repository that deployed the earlier examples/pages.yml.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The publisher accepts private repositories whose Pages site is private (refusing a public one before pushing), and publishes the default-branch map at the site root on the groma-previews branch beside retained pr-<number> previews, skipping a build that is no longer the default-branch head. The current-map example now publishes through it with the shared groma-pages concurrency group, the PR example no longer skips private repositories, and the README documents both. Verified with npm run check (25 tests, including private visibility, map placement next to previews and stale map builds) and a local end-to-end store/link run against a bare remote and a stub API for a private repository.
<!-- SECTION:FINAL_SUMMARY:END -->
