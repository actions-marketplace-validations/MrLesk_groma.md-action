import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

const fixture = new URL('./fixtures/certificate-trust/', import.meta.url);
const publication = new URL('../publish/publish.mjs', import.meta.url).href;

it('the publisher scopes filtered Git trust to its token-bearing child', { concurrency: true }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'groma-publication-trust-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ca = path.join(root, 'original.pem'), empty = path.join(root, 'empty'), config = path.join(root, 'gitconfig');
  const incidents = JSON.parse(await readFile(new URL('compromised-cas.json', fixture))).certificates;
  await mkdir(empty); await writeFile(config, '');
  await writeFile(ca, [await readFile(new URL('registry-ca.pem', fixture), 'utf8'), ...incidents.map(c => c.pem)].join('\n'));
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_.*|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy)$/i.test(key)));
  const env = { ...inherited, RUNNER_TEMP: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    GIT_SSL_CAINFO: ca, GIT_SSL_CAPATH: empty, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
    GITHUB_REPOSITORY: 'owner/fixture', GH_TOKEN: 'publication-fixture-token', NO_PROXY: 'localhost,127.0.0.1' };
  if (process.platform === 'win32') Object.assign(env, { GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.sslBackend', GIT_CONFIG_VALUE_0: 'openssl' });
  for (const filename of ['registry-server.pem', 'incident-server-aaa.pem']) {
    const headers = [];
    const server = https.createServer({ key: await readFile(new URL('registry-server-key.pem', fixture)),
      cert: await readFile(new URL(filename, fixture)) }, (request, response) => {
      headers.push(request.headers.authorization); response.writeHead(404); response.end('fixture repository not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
        `import { storeSite } from ${JSON.stringify(publication)}; await storeSite({});`],
        { env: { ...env, GITHUB_SERVER_URL: `https://localhost:${server.address().port}` } }).then(() => null, error => error);
      assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
      if (filename === 'registry-server.pem') {
        assert.ok(headers.length > 0, result.stderr);
        assert.equal(headers[0], 'basic ' + Buffer.from('x-access-token:publication-fixture-token').toString('base64'));
      } else assert.deepEqual(headers, [], 'The publisher must not send its token through the incident chain.');
      assert.equal(env.GIT_SSL_CAINFO, ca);
      assert.equal(env.GIT_SSL_CAPATH, empty);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});
