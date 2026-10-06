import { execFile } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const branch = 'groma-previews';
const ownership = '.groma-previews';
export const commentMarker = '<!-- groma-comparison -->';

export function validateSummary(summary) {
  for (const key of ['from', 'revision']) {
    if (!/^[a-f0-9]{40}$/.test(summary[key])) throw new Error(`Invalid comparison ${key}.`);
  }
  for (const group of ['components', 'relationships']) {
    for (const status of ['added', 'modified', 'removed']) {
      if (!Number.isSafeInteger(summary[group]?.[status]) || summary[group][status] < 0) {
        throw new Error(`Invalid ${group} count.`);
      }
    }
  }
  return summary;
}

export function commentBody(summary, url, repository) {
  const row = (label, counts) => `| ${label} | ${counts.added} | ${counts.modified} | ${counts.removed} |`;
  const empty = [summary.components, summary.relationships]
    .every(counts => Object.values(counts).every(count => count === 0));
  return `${commentMarker}
### Groma architecture comparison

${empty ? 'No architecture or owned-source changes in this comparison.\n\n' : ''}| Changes | Added | Modified | Removed |
| --- | ---: | ---: | ---: |
${row('Components', summary.components)}
${row('Relationships', summary.relationships)}

[Open before / after comparison](${url})

Compared [${summary.from.slice(0, 7)}](https://github.com/${repository}/commit/${summary.from}) (merge base) → [${summary.revision.slice(0, 7)}](https://github.com/${repository}/commit/${summary.revision}).`;
}

async function api(route, method = 'GET', body) {
  const response = await fetch(`${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${route}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function* pages(route, request = api) {
  for (let page = 1; ; page++) {
    const items = await request(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    yield* items;
    if (items.length < 100) return;
  }
}

export async function updateComment(number, body, request = api) {
  for await (const comment of pages(`/issues/${number}/comments`, request)) {
    if (comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(commentMarker)) {
      await request(`/issues/comments/${comment.id}`, 'PATCH', { body });
      return;
    }
  }
  await request(`/issues/${number}/comments`, 'POST', { body });
}

export async function assertDedicatedPages(owned, request = api) {
  const repository = await request('');
  if (repository.private) throw new Error('The complete PR workflow supports public repositories only.');
  const site = await request('/pages');
  if (site.build_type !== 'workflow') throw new Error('Select GitHub Actions in Settings → Pages.');
  if (owned) return;
  for await (const deployment of pages('/deployments?environment=github-pages', request)) {
    for await (const status of pages(`/deployments/${deployment.id}/statuses`, request)) {
      if (status.state === 'success') {
        throw new Error('This repository already has a Pages site. Keep its publisher and use the Groma build Action outputs.');
      }
    }
  }
}

// Only this PR directory is replaced. The branch is also the durable copy of all previews.
export async function replacePreview(site, artifact, number) {
  const destination = path.join(site, `pr-${number}`);
  await rm(destination, { recursive: true, force: true });
  await cp(artifact, destination, { recursive: true });
}

async function storePreview(context) {
  const site = await mkdtemp(path.join(process.env.RUNNER_TEMP, 'groma-pages-'));
  const credential = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
  const env = { ...process.env, GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${process.env.GITHUB_SERVER_URL}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credential}` };
  const git = async (...args) => (await run('git', args, { cwd: site, env })).stdout.trim();
  const remote = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git`;
  await git('init', '--quiet', '-b', branch);
  await git('remote', 'add', 'origin', remote);
  const exists = Boolean(await git('ls-remote', '--heads', 'origin', branch));
  if (exists) {
    await git('fetch', '--depth=1', 'origin', branch);
    await git('reset', '--hard', 'FETCH_HEAD');
    if (await readFile(path.join(site, ownership), 'utf8') !== 'Groma PR previews\n') {
      throw new Error('The groma-previews branch is not owned by Groma.');
    }
  }
  await assertDedicatedPages(exists);
  await replacePreview(site, context.directory, context.number);
  await writeFile(path.join(site, ownership), 'Groma PR previews\n');
  await writeFile(path.join(site, '.nojekyll'), '');
  await git('add', '.');
  if (await git('status', '--porcelain')) {
    await git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit', '--quiet', '-m', `PR #${context.number}: ${context.summary.revision}`);
    await git('push', 'origin', `HEAD:${branch}`);
  }
  // Pages receives only website content. Keep the Git checkout outside the artifact.
  await rm(path.join(site, '.git'), { recursive: true });
  await appendFile(process.env.GITHUB_OUTPUT, `ready=true\nsite=${site}\n`);
}

export async function publicationContext({ number, base, directory, theme }, request = api) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Invalid PR number.');
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid PR base commit.');
  if (!['auto', 'light', 'dark', 'blueprint'].includes(theme)) throw new Error('Invalid theme.');
  directory = path.resolve(directory);
  const summary = validateSummary(JSON.parse(await readFile(path.join(directory, 'architecture', theme, 'comparison.json'), 'utf8')));
  const pr = await request(`/pulls/${number}`);
  if (pr.head.sha !== summary.revision || pr.base.sha !== base) {
    console.log('A newer PR revision is available; this build will not be published.');
    return null;
  }
  return { number, directory, theme, summary };
}

if (process.argv[1] === import.meta.filename) {
  const current = await publicationContext({
    number: Number(process.env.GROMA_PULL_REQUEST), base: process.env.GROMA_BASE,
    directory: process.env.GROMA_DIRECTORY, theme: process.env.GROMA_THEME,
  });
  if (current && process.argv[2] === 'store') await storePreview(current);
  else if (current && process.argv[2] === 'comment') {
    const baseUrl = `${process.env.GROMA_PAGE_URL.replace(/\/$/, '')}/pr-${current.number}/architecture/${current.theme}/`;
    const url = `${baseUrl}?revision=${current.summary.revision}&from=${current.summary.from}`;
    await updateComment(current.number, commentBody(current.summary, url, process.env.GITHUB_REPOSITORY));
    await appendFile(process.env.GITHUB_OUTPUT, `url=${url}\n`);
  }
}
