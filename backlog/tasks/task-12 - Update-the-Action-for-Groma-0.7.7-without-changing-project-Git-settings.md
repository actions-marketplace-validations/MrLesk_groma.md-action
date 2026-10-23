---
id: TASK-12
title: Update the Action for Groma 0.7.7 without changing project Git settings
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23T17:58:00Z'
updated_date: '2026-10-23T19:28:00Z'
labels: []
dependencies: []
references:
  - action.yml
  - prepare-trust.mjs
  - trust-bootstrap.cjs
  - .github/workflows/check.yml
modified_files:
  - test/trust.test.mjs
  - trust-bootstrap.cjs
  - prepare-trust.mjs
  - action.yml
  - .github/workflows/check.yml
  - .github/workflows/groma-demo.yml
  - examples/pages.yml
  - examples/pull-request.yml
  - README.md
  - CONTRIBUTING.md
  - test/workflow-node-trust.test.mjs
  - publish/action.yml
  - groma.mjs
  - scan.mjs
  - comparison.mjs
  - test/scan.test.mjs
  - test/comparison.test.mjs
  - test/groma.test.mjs
  - test/publication-trust.test.mjs
  - publish/publish.mjs
type: bug
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Action must adopt the coordinated Groma hotfix while keeping its Node/npm download protections scoped to its own operations. Its public composite bootstrap currently exports native Git trust overrides that would keep HTTPS proxies blocked even after the CLI fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Action default and documented examples use published Groma0.7.7 and npm12.2.1 for installation.
- [x] #2 Public Action setup and Groma installation do not export Git or generic native TLS overrides into later project commands; native Git proxy and CA settings remain unchanged.
- [x] #3 The Action check suite and real CLI export smoke pass on Windows Linux and macOS before one stable patch release advances v1.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Keep the repositories own hosted checkout and release trust preparation. Narrow the public composite setup bootstrap to Node certificate settings only and stop exporting npm installation child settings to the workflow. This fixes the reproduced public Action environment problem without replacing user Git configuration or adding fallback behavior. Update the existing bootstrap test to assert no Git or generic native TLS override is exported and keep existing owned-download tests. Update CLI and npm patch pins, run tests, then verify the real released CLI smoke on three platforms and publish one Action release.

Final code-review regression: Action-owned Node downloads must reject the incident certificate even when inherited OpenSSL trust contains it, while native Git retains caller policy. The reviewer reproduced a connection accepted through the inherited store because NODE_EXTRA_CA_CERTS is additive. Existing bundle-content and npm tests do not exercise this Node HTTPS path. Add one network test with private-root success, incident rejection and an unfiltered-store control. Scope filtered OpenSSL settings to third-party Node steps; scripts running the pinned patched Node use its bundled roots plus filtered private authorities. Keep Git and generic TLS settings out of GITHUB_ENV.

The first real Windows CLI smoke reproduced spawnSync groma ENOENT in scan.mjs: the npm-installed command is a Windows command wrapper, which Node execFile cannot start directly. AC3 requires this supported Action flow to work on Windows. Record the installed launcher path after npm installation and invoke that CommonJS file through the selected Node executable for both scan and comparison. Extend the existing scan/comparison argument tests and add one real launcher-process check with a spaced path, literal shell characters, an empty PATH and native Git environment preservation; current mocks cannot detect command-wrapper startup failures. Do not use shell:true or duplicate platform selection.

Security review identified a supported publication regression: the public publisher sends its own write token through Git but no longer applies its previous filtered trust when invoked without the example bootstrap. Preserve strict trust only within the publisher-owned Git child, without exporting settings or changing project Git. Existing token tests prepare trust outside storeSite and miss this entry path. Add one real storeSite child-process regression: a private-root endpoint receives the scoped token, while an incident endpoint receives no HTTP request. This restores the publisher own boundary; project scanner Git still follows native policy.

Launcher review found a regression against the previous scan flow: async execFile ignores stdio inheritance and aborts output above1MiB. Streaming successful scanner output to workflow logs is existing behavior. Change the shared launcher to spawn with inherited streams and extend its real process regression with2MiB of output directed to an owned log descriptor. It must preserve all output, literal arguments, inherited Git settings and the nonzero child result without buffering in the launcher.

The next Windows smoke reached export and found examples/demo.js incorrectly included despite the /examples/ exclusion. Git Bash converts path-looking environment values before starting native Node; MSYS2 documents this behavior. Preserve GROMA_EXCLUDE verbatim at the prepare.mjs launch by extending the caller existing MSYS2_ENV_CONV_EXCL list for this one variable. The existing real-export assertion already detects the incorrect source inventory, so no extra text-inventory or mocked unit test is needed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cold simplicity review found no blockers and confirmed that separate Node setup and npm installation preparation have clear responsibilities. Its stale native Git ownership comment was corrected in the shared module and all inline copies. Implementer specification/quality review: public setup emits only Node settings, npm installation has child-only settings and no GITHUB_ENV export, and published CLI pin/real smoke are gated on Groma0.7.7. The repository own checkout/publication trust path remains strict and separate. Existing checks pass all58tests; the public bootstrap regression fails before the fix because it inspects a caller Git setting, and passes after setup stops doing so. The released-CLI smoke matrix now covers Windows Linux and macOS with Bash selected explicitly.

Full-context complexity review found no blockers. Accepted its scoped simplification: installation settings are already Node/npm-only, so installGroma no longer filters Git keys or removes the caller GIT_SSL_NO_VERIFY value from its child environment. Its npm command still explicitly enables strict SSL. Updated the existing command-observation test to prove inherited Git values survive. Public composites preserve caller Git policy; example workflows explicitly choose their own strict checkout policy.

Final full local Action suite after the accepted simplification:58 passed,0 failed. No source changes followed it. Publication and exact released-CLI three-platform smoke remain gated until Groma0.7.7 is available.

Final workflow portability review found that the old Linux-only comparison smoke used sed -i, which is not portable to macOS. Replaced that fixture edit with Node file I/O for the newly required three-platform smoke. No product behavior, test assertions or timeout changed.

Relevant final code-review P1 reproduced with the installed Node24.13.0: inherited incident OpenSSL trust accepted the HTTPS request, so the new rejection check failed before the fix. Patched Node26.12.1 independently rejects that incident chain. prepareWorkflowTrust now separates Node workflow settings from OpenSSL step settings. Both public composites export only Node settings. setup-node/cache/Pages Node actions receive the filtered CA file and empty CA directory within their own steps; scripts use the pinned patched Node bundled store plus filtered private authorities. No native Git or generic TLS override enters project commands. The setup regression passes with the older runner Node24 after the fix. Full Action suite passes all60 tests with Node26.12.1, including private-root success and incident rejection for both Node entry paths. Specification and quality re-review is limited to the P1 and these changes: the two trust scopes have named owners, original settings survive, and no preload module, caller configuration repair, compatibility layer or new dependency was added.

The first released-CLI matrix exposed Windows npm-command startup failure in scan.mjs (spawnSync groma ENOENT); unit mocks and shell version checks could not detect it. Installation now exports the exact installed CommonJS launcher path. groma.mjs starts that file with the selected Node executable for both scan and comparison, without a shell or duplicated platform selection. A real process regression verifies a spaced launcher path, literal shell characters, empty PATH, native Git CA/proxy inheritance and nonzero exit propagation. The publisher security finding is also fixed at its own boundary: storeSite prepares strict filtered trust only for its token-bearing Git child, never GITHUB_ENV. Its regression failed before the fix because the incident server received the fixture token; after the fix the incident server gets no request and a valid private server receives the scoped token. This restores the existing privileged publication guarantee while project Git remains native. Final local check: all62 tests pass. Implementer specification/quality re-review covers only these findings and resulting changes: installation owns the launcher path, one shared operation launches it on all systems, and publisher trust stays with the component that owns the write token. No shell execution, extra dependency or caller configuration mutation was added.

Final launcher P2 is fixed: spawn now inherits streams by default instead of buffering execFile output. The extended process regression failed before the fix with ERR_CHILD_PROCESS_STDIO_MAXBUFFER when the child wrote2MiB; after the fix all output reaches the owned descriptor, literal arguments and Git settings survive, and child exit6 remains the reported failure. Full local suite again passes62 tests. Targeted specification/quality review found no further regression in the changed launcher: no shell, no command-wrapper dependency, no fixed output buffer, and error/close events determine completion.

Windows export now starts correctly and caught a separate input-boundary defect: Git Bash converts the root-relative /examples/ environment pattern into a native path. The prepare command now opts only GROMA_EXCLUDE out of that conversion, preserving any existing conversion-exclusion list. MSYS2 authoritative path documentation supports this fix. Existing end-to-end verification remains unchanged and requires exactly the two selected source files, excluding examples/demo.js. No root CLI change or new Groma release is needed.

Release complete: exact source de3067b passed unit and real Groma0.7.7 export/committed-comparison smoke on Windows/Linux/macOS in40010143214. PR11 merged as c9cb937; its tree exactly matches that tested source. One full Actionv1.2.3 release is published at https://github.com/MrLesk/groma.md-action/releases/tag/v1.2.3 and its Marketplace badge is visible after Alex completed GitHubMobile verification. Release40010793051 repeated all six checks successfully and advanced v1 to c9cb937; main CI40010761089 also passed. All three relevant review threads are resolved. The final small Windows pattern fix preserves the existing end-to-end source assertion; all62 local tests pass. Final supported flow: prepare Node trust, install the exact CLI and expose its launcher path, prepare project inputs without shell path conversion, invoke the launcher with streamed output, then export/compare. npm and the token-bearing publisher own their child trust settings. Project Git remains under the caller native policy. No extra release or prerelease was created.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released Actionv1.2.3 using Groma0.7.7 and npm12.2.1, published it to Marketplace and advanced v1 after all Windows/Linux/macOS unit and real CLI checks passed. Fixed Windows npm launcher startup and ignore-pattern conversion, retained streamed scanner output, isolated Node trust, and kept publisher token checks inside its own Git child. All62 local tests pass; relevant review findings have failing-before/passing-after evidence. Project Git settings are not exported or repaired.
<!-- SECTION:FINAL_SUMMARY:END -->
