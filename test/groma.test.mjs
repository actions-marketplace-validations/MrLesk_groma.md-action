import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, open, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { runGroma } from '../groma.mjs';

it('starts the installed launcher without a shell or PATH and streams large output while preserving arguments, Git settings and exit status',
  { concurrency: true }, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'groma launcher '));
    t.after(() => rm(root, { recursive: true, force: true }));
    const launcher = path.join(root, 'installed launcher.cjs');
    await writeFile(launcher, `process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\\n'); console.log(JSON.stringify({ args: process.argv.slice(2),
      ca: process.env.GIT_SSL_CAINFO, proxy: process.env.GIT_PROXY_SSL_CAINFO })); process.exitCode = 6;`);
    const args = ['export', 'a path with spaces', 'literal&value', '$(literal)', '"quoted"'];
    const outputFile = path.join(root, 'output.log'), output = await open(outputFile, 'w');
    try {
      await assert.rejects(runGroma(args, { cwd: root, stdio: ['ignore', output.fd, output.fd],
        env: { ...process.env, PATH: '', GROMA_CLI: launcher,
          GIT_SSL_CAINFO: 'caller-ca.pem', GIT_PROXY_SSL_CAINFO: 'caller-proxy.pem' } }), error => {
        assert.equal(error.code, 6);
        return true;
      });
    } finally { await output.close(); }
    const text = await readFile(outputFile, 'utf8'), newline = text.indexOf('\n');
    assert.equal(newline, 2 * 1024 * 1024);
    assert.deepEqual(JSON.parse(text.slice(newline + 1)), { args, ca: 'caller-ca.pem', proxy: 'caller-proxy.pem' });
  });
