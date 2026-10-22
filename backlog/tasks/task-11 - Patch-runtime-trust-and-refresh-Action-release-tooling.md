---
id: TASK-11
title: Patch runtime trust and refresh Action release tooling
status: Done
assignee:
  - '@codex'
created_date: '2026-10-21T13:05:00Z'
updated_date: '2026-10-22T19:43:00Z'
labels: []
dependencies: []
modified_files:
  - .github/workflows/check.yml
  - .github/workflows/groma-demo.yml
  - CONTRIBUTING.md
  - README.md
  - action.yml
  - comparison.mjs
  - examples/pages.yml
  - examples/pull-request.yml
  - package.json
  - prepare-trust.mjs
  - publish/action.yml
  - publish/publish.mjs
  - test/fixtures/certificate-trust/README.md
  - test/fixtures/certificate-trust/compromised-cas.json
  - test/fixtures/certificate-trust/incident-server-aaa.pem
  - test/fixtures/certificate-trust/incident-server-emudhra.pem
  - test/fixtures/certificate-trust/registry-ca.pem
  - test/fixtures/certificate-trust/registry-server-key.pem
  - test/fixtures/certificate-trust/registry-server.pem
  - test/trust.test.mjs
  - trust-bootstrap.cjs
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update Action runtimes and certificate validation while preserving supported private CA configuration and authentication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Action and workflow examples use patched Node/npm and current Action releases, with default Groma 0.7.6.
- [x] #2 Certificate validation excludes compromised keys while preserving supported private CA settings, authentication and inherited Git configuration.
- [x] #3 Native compatibility and certificate rejection tests pass on Linux, macOS and Windows, and workflow YAML validates.
- [x] #4 The GitHub Release workflow verifies the published CLI and advances only the supported major Action tag after checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Update runtime and CLI defaults, filter compromised authorities, preserve native Git and npm trust settings, and verify supported behavior across operating systems before release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npm run check passed on Linux, macOS and Windows. The v1.2.2 release workflow passed the published Groma 0.7.6 export and committed-comparison checks, then advanced v1 to the checked release commit. Native Git HTTPS proxies are unsupported; direct HTTPS and HTTP CONNECT proxies remain supported.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released v1.2.2 with Groma 0.7.6, patched Node/npm tooling and filtered certificate trust. Supported private CA settings and Git authentication are preserved. PR #10 is merged, all release checks passed, and v1 identifies the verified release.
<!-- SECTION:FINAL_SUMMARY:END -->
