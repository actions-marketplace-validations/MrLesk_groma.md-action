# groma.md Action

Architecture diffs on your pull requests. Each PR gets one comment with the change counts and a link to an interactive before/after map, with descriptions and source diffs.

See it on the [demo PR](https://github.com/MrLesk/groma.md-action/pull/4).

## Add PR comparisons

For public repositories without an existing GitHub Pages site:

1. Commit your Groma architecture (`groma/` or `.groma/`) to your default branch. [New to Groma?](https://github.com/MrLesk/groma.md#get-started)
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Copy [`examples/pull-request.yml`](examples/pull-request.yml) to `.github/workflows/groma-pr.yml` on your default branch.

Every PR then gets the comment, updated on each push. The map compares the PR with its merge base, so it shows what the PR introduces. No account or secret needed: the workflow uses `GITHUB_TOKEN`. Fork PRs work too.

### Existing Pages sites

Keep your publisher. Run the build Action with `from` and `revision` (check out with `fetch-depth: 0`), then pass its `output` and `summary` to your publisher. The workflow above refuses to replace another Pages site.

### What runs on a PR

- `compare` is read-only. It exports the committed architecture and source of both commits. It doesn't scan, install dependencies or run PR scripts.
- `publish` deploys the preview to Pages and updates the comment. Keep PR-supplied commands out of this job.
- Previews are public and stay at `/pr-<number>/architecture/auto/` after the PR closes. Private repositories aren't supported.

## Publish a current map

For a repository without a Pages site, set the Pages source to **GitHub Actions** and copy [`examples/pages.yml`](examples/pages.yml): it scans the current checkout and publishes its map. To add the map to a site you already build:

```yaml
- uses: MrLesk/groma.md-action@v1
  with:
    output: site # your built site
    theme: blueprint
```

The Action scans with the scanners committed in `scanners.json`. It doesn't initialize Groma.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
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

The Action installs Groma 0.6.5. `@v1` always points to the latest 1.x release.
