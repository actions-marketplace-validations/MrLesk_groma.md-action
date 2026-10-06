import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { assertDedicatedPages, commentBody, commentMarker, publicationContext, replacePreview, updateComment, validateSummary } from '../publish/publish.mjs';

const summary = {
  from: 'a'.repeat(40), revision: 'b'.repeat(40),
  components: { added: 0, modified: 0, removed: 0 },
  relationships: { added: 0, modified: 0, removed: 0 },
};

it('shows an empty comparison, both commits and a direct comparison link', { concurrency: true }, () => {
  const url = 'https://example.com/pr-3/architecture/auto/';
  const body = commentBody(validateSummary(summary), url, 'owner/project');
  assert.match(body, /No architecture or owned-source changes/);
  for (const value of [url, summary.from, summary.revision]) assert.ok(body.includes(value));
  const changed = structuredClone(summary);
  changed.relationships.added = 1;
  assert.doesNotMatch(commentBody(changed, url, 'owner/project'), /No architecture/);
  changed.components.added = -1;
  assert.throws(() => validateSummary(changed), /count/);
});

it('updates the existing bot comment while ignoring a copied marker in a human comment', { concurrency: true }, async () => {
  const mutations = [];
  const request = async (route, method, body) => {
    if (!method) return [
      { id: 1, user: { login: 'contributor' }, body: commentMarker },
      { id: 2, user: { login: 'github-actions[bot]' }, body: commentMarker + '\nold' },
    ];
    mutations.push({ route, method, body });
  };
  await updateComment(3, 'updated', request);
  assert.deepEqual(mutations, [{ route: '/issues/comments/2', method: 'PATCH', body: { body: 'updated' } }]);
});

it('creates the first comparison comment', { concurrency: true }, async () => {
  const mutations = [];
  await updateComment(3, 'new', async (route, method, body) => {
    if (!method) return [];
    mutations.push({ route, method, body });
  });
  assert.deepEqual(mutations, [{ route: '/issues/3/comments', method: 'POST', body: { body: 'new' } }]);
});

it('replaces one preview while preserving other PRs and removing obsolete files in that preview', { concurrency: true }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'groma-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = path.join(root, 'site');
  const artifact = path.join(root, 'artifact');
  for (const directory of [artifact, path.join(site, 'pr-1'), path.join(site, 'pr-2')]) await mkdir(directory, { recursive: true });
  await writeFile(path.join(site, 'pr-1/obsolete.html'), 'old');
  await writeFile(path.join(site, 'pr-2/index.html'), 'other PR');
  await writeFile(path.join(artifact, 'index.html'), 'new');
  await replacePreview(site, artifact, 1);
  assert.equal(await readFile(path.join(site, 'pr-1/index.html'), 'utf8'), 'new');
  assert.equal(await readFile(path.join(site, 'pr-2/index.html'), 'utf8'), 'other PR');
  await assert.rejects(readFile(path.join(site, 'pr-1/obsolete.html')), { code: 'ENOENT' });
});

it('rejects private publication and unrelated successful Pages deployments', { concurrency: true }, async () => {
  await assert.rejects(assertDedicatedPages(false, async () => ({ private: true })), /public repositories/);
  const request = async route => {
    if (route === '') return { private: false };
    if (route === '/pages') return { build_type: 'workflow' };
    if (route.startsWith('/deployments?')) return [{ id: 1 }];
    if (route.startsWith('/deployments/1/statuses')) return [{ state: 'success' }];
    throw new Error(route);
  };
  await assert.rejects(assertDedicatedPages(false, request), /already has a Pages site/);
  await assertDedicatedPages(true, request);
});

it('allows first publication while its current deployment is pending', { concurrency: true }, async () => {
  await assertDedicatedPages(false, async route => {
    if (route === '') return { private: false };
    if (route === '/pages') return { build_type: 'workflow' };
    if (route.startsWith('/deployments?')) return [{ id: 1 }];
    return [{ state: 'pending' }];
  });
});

for (const changed of [null, 'head', 'base']) {
  it(`manual PR publication ${changed ? 'rejects a changed ' + changed : 'uses the selected PR'}`, { concurrency: true }, async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'groma-manual-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const exported = path.join(directory, 'architecture/auto');
    await mkdir(exported, { recursive: true });
    await writeFile(path.join(exported, 'comparison.json'), JSON.stringify(summary));
    const base = 'c'.repeat(40);
    const result = await publicationContext({ number: 42, base, directory, theme: 'auto' }, async route => {
      assert.equal(route, '/pulls/42');
      return {
        head: { sha: changed === 'head' ? 'd'.repeat(40) : summary.revision },
        base: { sha: changed === 'base' ? 'e'.repeat(40) : base },
      };
    });
    if (changed) assert.equal(result, null);
    else {
      assert.equal(result.number, 42);
      assert.equal(result.directory, directory);
      assert.deepEqual(result.summary, summary);
    }
  });
}
