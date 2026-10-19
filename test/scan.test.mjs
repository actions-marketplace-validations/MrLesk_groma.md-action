import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { scanAndExport } from '../scan.mjs';

for (const failUpdate of [false, true]) {
  it(`finishes npm updates before export${failUpdate ? ', stopping on an update failure' : ' with a warm package cache'}`, { concurrency: true }, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'groma-publication-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const configFile = path.join(root, 'config.json');
    await writeFile(configFile, JSON.stringify({ scanners: [
      { id: 'first', source: '@example/first@1.0.0' },
      { id: 'second', source: 'second@1.0.0' },
      { id: 'local', source: './scanner' },
      { id: 'git', source: 'git+https://example.com/scanner#revision' },
    ] }));
    const calls = [];
    const execute = async (command, args) => {
      assert.equal(command, 'groma');
      calls.push(args);
      if (failUpdate && args[1] === 'update') throw new Error('update failed');
    };
    const exporting = scanAndExport({ configFile, directory: 'site', repositoryRoot: root, execute });
    if (failUpdate) {
      await assert.rejects(exporting, /update failed/);
      assert.deepEqual(calls, [['plugin', 'install'], ['plugin', 'update', 'first']]);
    } else {
      await exporting;
      assert.deepEqual(calls, [
        ['plugin', 'install'], ['plugin', 'update', 'first'], ['plugin', 'update', 'second'],
        ['scanner', 'check'], ['scan'], ['export', 'site'],
      ]);
    }
  });
}
