# Contributing

## Development

Run `npm run check` with Node 26.12.1 or newer and npm 12.2.0. Tests use their own temporary directories and run concurrently. CI also runs the root Action against an initialized JavaScript/TypeScript fixture and verifies the exported sources.

- `action.yml` and `prepare.mjs`: build inputs, runtime setup and the scanner cache.
- `trust-bootstrap.cjs` and `prepare-trust.mjs`: offline CA preparation and strict native npm installation. npm's own configuration loader resolves its selected CA policy into a separate filtered bundle. Keep the inline workflow bootstraps identical to the shared source; the regression suite checks them.
- `comparison.mjs`: exports committed revisions with scanner hooks disabled and reads Groma's change counts.
- `publish/action.yml` and `publish/publish.mjs`: retained Pages previews and the PR comment.
- `examples/pull-request.yml`: connects the read-only build to the separate publisher.

## Releases

The Groma CLI version pinned in `action.yml` and the Action's own version are separate.

1. Wait for Groma 0.7.6 to be published through its GitHub Release workflow and confirm `npm view groma.md@0.7.6 version`.
2. Confirm the CLI pin and README, run `npm run check`, and verify the **Check** workflow on the exact candidate commit, including its real npm/CLI smoke test and native proxy controls. The hotfix deliberately blocks native Git HTTPS proxy transport because Git does not expose proxy CA-directory isolation; direct and HTTP-proxy origin TLS remain tested. The private package has no release-version field to bump.
3. Create a GitHub Release named `v1.2.2` for that tested commit and publish it to [GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace). Begin release publication through GitHub Release, rather than a raw tag push.
4. The release-published **Check** run repeats the three-platform checks and real CLI smoke on the exact release commit. Its isolated release job advances `v1` only for the highest stable `v1.x.y` version across all release pages, even after a later major exists, using a non-forced ref update after both gates pass. Keep full version tags fixed and example references on `@v1`.
