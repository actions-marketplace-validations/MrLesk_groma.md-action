# groma.md Action

Architecture diffs on your pull requests. Each PR gets one comment with the change counts and a link to an interactive before/after map, with descriptions and source diffs.

See it on the [demo PR](https://github.com/MrLesk/groma.md-action/pull/4).

## Add PR comparisons

For public repositories without an existing GitHub Pages site:

1. Commit your Groma architecture (`groma/` or `.groma/`) to your default branch. [New to Groma?](https://github.com/MrLesk/groma.md#get-started)
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Copy [`examples/pull-request.yml`](examples/pull-request.yml) to `.github/workflows/groma-pr.yml` on your default branch.

PRs from the same repository get the comment, updated on each push. The map compares the PR with its merge base, so it shows what the PR introduces. No account or secret needed: the workflow uses `GITHUB_TOKEN`. Fork PRs wait for a maintainer: after review, open **Actions → Groma PR comparison → Run workflow** on the default branch and enter the PR number. This approves one comparison; later fork pushes do not trigger another export.

### Existing Pages sites

Keep your publisher. Run the build Action with `from` and `revision` (check out with `fetch-depth: 0`), then pass its `output` and `summary` to your publisher. The workflow above refuses to replace another Pages site.

### What runs on a PR

- `compare` is read-only. It keeps the trusted base checked out and fetches the PR commit as data. Groma exports both committed snapshots without scanning, installing application dependencies or running PR scripts. Keep checkout's fork protection enabled.
- `publish` receives the selected PR number and exact base commit, deploys the preview to Pages and updates the comment. It skips publication if the PR head or base has changed. Keep PR-supplied commands out of this job.
- Previews are public and stay at `/pr-<number>/architecture/auto/` after the PR closes. Private repositories aren't supported.

## Publish a current map

For a repository without a Pages site, set the Pages source to **GitHub Actions** and copy [`examples/pages.yml`](examples/pages.yml): it scans the current checkout and publishes its map. To add the map to a site you already build:

```yaml
- uses: MrLesk/groma.md-action@v1
  with:
    groma-version: '0.6.5'
    output: site # your built site
    theme: blueprint
```

The Action scans with the scanners committed in `scanners.json`. It doesn't initialize Groma.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `groma-version` | `0.6.5` | Groma CLI version; pin it to control reader upgrades |
| `output` | `groma-site` | Website root, relative to the checkout |
| `theme` | `auto` | `auto`, `light`, `dark` or `blueprint` |
| `exclude` | | Extra scan exclusions, one per line; not for comparisons |
| `from` | | Earlier commit to compare, with `revision` |
| `revision` | | Later commit to compare, with `from` |

| Output | Meaning |
| --- | --- |
| `output` | Absolute website root |
| `directory` | The map, at `<output>/architecture/<theme>/` |
| `summary` | Comparison JSON with the change counts; empty without `from` |

The default is Groma 0.6.5. `@v1` follows Action releases, which can change that default. Set `groma-version` to an exact release to keep reader upgrades explicit.

Both comparison commits must contain architecture that the selected Groma version can read. After a format change, update an older PR from its base branch so its merge base and head use the current format. Choosing a version does not convert committed architecture.
