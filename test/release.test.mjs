import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';

const workflow = (await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const script = workflow.match(/node --input-type=module <<'NODE'\n([\s\S]+?)          NODE/)[1]
  .split('\n').map(line => line.slice(10)).join('\n').replace("import { readFileSync } from 'node:fs';", '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('readFileSync', 'process', 'fetch', 'console', script);
const checked = 'a'.repeat(40);

async function releaseRun(release, pages) {
  const calls = [];
  const fetch = async (url, options) => {
    const route = url.replace('https://api.fixture/repos/fixture/repo/', '');
    calls.push({ route, method: options.method, body: options.body && JSON.parse(options.body) });
    let value;
    if (route === `git/ref/tags/${release.tag_name}`) value = { object: { type: 'commit', sha: checked } };
    else if (route.startsWith('releases?')) value = pages[Number(new URL(url).searchParams.get('page')) - 1] ?? [];
    else if (route === 'git/ref/tags/v1') value = { object: { type: 'commit', sha: 'b'.repeat(40) } };
    else if (route === 'git/refs/tags/v1' && options.method === 'PATCH') value = {};
    else throw new Error('Unexpected API route: ' + route);
    return { ok: true, status: 200, json: async () => value };
  };
  await run(() => JSON.stringify({ release }), { env: { GITHUB_API_URL: 'https://api.fixture',
    GITHUB_REPOSITORY: 'fixture/repo', GITHUB_SHA: checked, GITHUB_EVENT_PATH: '/fixture/event.json', GH_TOKEN: 'test-only' } }, fetch, { log() {} });
  return calls;
}

it('advances v1 to its newest stable maintenance release even when v2 is globally newer', async () => {
  const release = { id: 2, tag_name: 'v1.2.2' };
  const calls = await releaseRun(release, [[{ id: 3, tag_name: 'v2.0.0' }, release,
    { id: 1, tag_name: 'v1.2.1' }, { id: 4, tag_name: 'v1.99.0', draft: true },
    { id: 5, tag_name: 'v1.100.0', prerelease: true }]]);
  assert.deepEqual(calls.filter(call => call.method !== 'GET'), [
    { route: 'git/refs/tags/v1', method: 'PATCH', body: { sha: checked, force: false } },
  ]);
});

it('does not move v1 for an older maintenance release', async () => {
  const release = { id: 1, tag_name: 'v1.2.1' };
  const calls = await releaseRun(release, [[release, { id: 2, tag_name: 'v1.2.2' }, { id: 3, tag_name: 'v2.0.0' }]]);
  assert.equal(calls.some(call => call.method !== 'GET'), false);
});

it('checks later release pages before advancing v1', async () => {
  const release = { id: 200, tag_name: 'v1.2.2' };
  const first = Array.from({ length: 100 }, (_, index) => ({ id: index, tag_name: `v1.0.${index}` }));
  const calls = await releaseRun(release, [first, [release, { id: 201, tag_name: 'v1.2.3' }]]);
  assert.ok(calls.some(call => call.route === 'releases?per_page=100&page=2'));
  assert.equal(calls.some(call => call.method !== 'GET'), false);
});
