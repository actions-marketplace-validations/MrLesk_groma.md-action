import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { promisify } from 'node:util';
import { exportComparison, readPayload, summarize } from '../comparison.mjs';

const run = promisify(execFile);
const payload = {
  revision: { id: 'b'.repeat(40) },
  comparison: {
    from: { id: 'a'.repeat(40) },
    components: { a: { status: 'added' }, b: { status: 'modified' }, c: { status: 'unchanged' } },
    relationships: { a: 'removed', b: 'unchanged' },
  },
};

it('counts only changes reported by Groma and preserves both commit identities', { concurrency: true }, () => {
  assert.deepEqual(summarize(payload), {
    from: 'a'.repeat(40), revision: 'b'.repeat(40),
    components: { added: 1, modified: 1, removed: 0 },
    relationships: { added: 0, modified: 0, removed: 1 },
  });
  assert.throws(() => readPayload('<script>throw new Error("must not execute")</script>'));
});

for (const fail of [false, true]) {
  it(`isolates plugins without changing config during ${fail ? 'failed' : 'successful'} export`, { concurrency: true }, async t => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'groma-comparison-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    await run('git', ['init', '--quiet', root]);
    await mkdir(path.join(root, 'groma'));
    const configFile = path.join(root, 'groma/config.json');
    const original = '{ "scanners": [{"source":"./local-scanner"}], "workSources": [{"source":"./local-work-source"}] }\n';
    await writeFile(configFile, original);
    let exportRoot;
    const execute = async (command, args, options) => {
      assert.equal(command, 'groma');
      assert.deepEqual(args, ['export', root, '--from', 'before', '--revision', 'after']);
      exportRoot = options.cwd;
      assert.notEqual(exportRoot, root);
      assert.deepEqual(await readdir(exportRoot), ['groma']);
      assert.deepEqual(await readdir(path.join(exportRoot, 'groma')), []);
      assert.equal(options.env.GIT_WORK_TREE, exportRoot);
      assert.equal(await readFile(configFile, 'utf8'), original);
      const git = await run('git', ['rev-parse', '--absolute-git-dir'], options);
      assert.equal(path.resolve(git.stdout.trim()), path.join(root, '.git'));
      if (fail) throw new Error('export failed');
      await writeFile(path.join(root, 'index.html'), `<script type="application/json" id="world">${JSON.stringify(payload)}</script>`);
    };
    const exported = exportComparison({ repositoryRoot: root, directory: root, from: 'before', revision: 'after', execute });
    if (fail) await assert.rejects(exported, /export failed/);
    else assert.deepEqual(JSON.parse(await readFile(await exported, 'utf8')), summarize(payload));
    assert.equal(await readFile(configFile, 'utf8'), original);
    await assert.rejects(stat(exportRoot), { code: 'ENOENT' });
  });
}
