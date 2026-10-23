import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { it } from 'node:test';
import { publicationGitEnvironment, storeSite } from '../publish/publish.mjs';
import { blockedSPKI, filterAuthorities, npmAuthorities, trustSettings, prepareTrust, prepareWorkflowTrust, exportSettings,
  installArguments, installGroma, runNpm } from '../prepare-trust.mjs';

const fixture = path.join(import.meta.dirname, 'fixtures/certificate-trust');
const incidents = JSON.parse(await readFile(path.join(fixture, 'compromised-cas.json'), 'utf8')).certificates;
const privateCA = await readFile(path.join(fixture, 'registry-ca.pem'), 'utf8');
const certificates = pem => pem.match(/-----BEGIN ((?:TRUSTED )?CERTIFICATE)-----[\s\S]+?-----END \1-----/g) ?? [];
const key = pem => createHash('sha256').update(new X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'groma-trust-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

it('excludes every incident certificate variant by all twelve SPKI keys while preserving and deduplicating private roots', () => {
  assert.equal(blockedSPKI.size, 12);
  assert.deepEqual(new Set(incidents.map(c => key(c.pem))), blockedSPKI);
  const actual = certificates(filterAuthorities([...incidents.map(c => c.pem), privateCA, privateCA]));
  assert.equal(actual.length, 1);
  assert.equal(new X509Certificate(actual[0]).fingerprint256, new X509Certificate(privateCA).fingerprint256);
});

it('fails closed for empty, compromised-only, malformed and non-PEM trust', () => {
  for (const input of [[], incidents.map(c => c.pem), ['garbage'], ['-----BEGIN CERTIFICATE-----\ngarbage\n-----END CERTIFICATE-----']]) {
    assert.throws(() => filterAuthorities(input));
  }
});

it('rejects every inherited Git TLS bypass spelling and value before preparing workflow trust', async t => {
  const root = await temporary(t);
  for (const name of ['GIT_SSL_NO_VERIFY', 'git_ssl_no_verify', 'Git_Ssl_No_Verify']) {
    for (const value of ['', 'false', '0', '1']) {
      assert.throws(() => prepareTrust({ env: { [name]: value }, directory: root, npmInputs: null,
        bundled: [privateCA], getCertificates: () => { throw new Error('Must reject the bypass first.'); } }), /Remove GIT_SSL_NO_VERIFY/);
    }
  }
});

it('prepares composite workflow trust without PATH Node/npm and preserves original npm CA selection', async t => {
  const root = await temporary(t), env = { PATH: '', NPM_CONFIG_CAFILE: '/original/npm-policy.pem',
    GIT_SSL_CAINFO: '/private/git-ca.pem', GIT_PROXY_SSL_CAINFO: '/private/proxy-ca.pem', GIT_SSL_NO_VERIFY: 'false' };
  const { node: settings } = prepareWorkflowTrust({ env, directory: root, bundled: [privateCA], getCertificates: () => [] });
  assert.deepEqual(certificates(await readFile(settings.NODE_EXTRA_CA_CERTS, 'utf8')).map(key), [key(privateCA)]);
  assert.equal(Object.hasOwn(settings, 'NPM_CONFIG_CAFILE'), false);
  assert.equal(Object.hasOwn(settings, 'npm_config_cafile'), false);
  assert.equal(env.NPM_CONFIG_CAFILE, '/original/npm-policy.pem');
  assert.deepEqual(Object.keys(settings).sort(), ['NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_USE_SYSTEM_CA']);
  assert.equal(env.GIT_SSL_CAINFO, '/private/git-ca.pem');
  assert.equal(env.GIT_PROXY_SSL_CAINFO, '/private/proxy-ca.pem');
  for (const filename of ['action.yml', 'publish/action.yml']) {
    const source = await readFile(new URL('../' + filename, import.meta.url), 'utf8');
    const first = source.slice(source.indexOf('    - name: Prepare filtered'), source.indexOf('    - uses: actions/setup-node'));
    assert.match(first, /uses: actions\/github-script@v9\.0\.0/);
    assert.match(first, /trust\.prepareWorkflowTrust\(\)/);
    assert.doesNotMatch(first, /shell:|run: node/);
  }
});

it('unions bundled, default, system, extra and configured private CAs and creates an empty fallback directory', async t => {
  const root = await temporary(t), custom = path.join(root, 'custom.pem');
  await writeFile(custom, privateCA);
  const calls = [];
  const settings = prepareTrust({ directory: root, env: { SSL_CERT_FILE: custom }, bundled: [tls.rootCertificates[0]],
    getCertificates: kind => { calls.push(kind); return [privateCA, incidents[0].pem]; }, npmInputs: null });
  assert.deepEqual(calls, ['default', 'system', 'extra']);
  const actual = certificates(await readFile(settings.SSL_CERT_FILE, 'utf8'));
  assert.equal(actual.length, 2);
  assert.ok(actual.some(pem => key(pem) === key(privateCA)));
  assert.deepEqual(await readdir(settings.SSL_CERT_DIR), []);
  assert.equal(settings.NODE_EXTRA_CA_CERTS, settings.SSL_CERT_FILE);
});

it('uses native npm precedence when user inline CA replaces global cafile and env cafile replaces user CA', async t => {
  const root = await temporary(t), global = path.join(root, 'global.npmrc'), user = path.join(root, 'user.npmrc');
  const cafile = path.join(root, 'corporate-ca.pem');
  await writeFile(cafile, privateCA);
  await writeFile(global, `cafile=${cafile}\n`);
  await writeFile(user, `ca=${JSON.stringify(tls.rootCertificates[0])}\n`);
  const env = { ...process.env, NPM_CONFIG_GLOBALCONFIG: global, NPM_CONFIG_USERCONFIG: user };
  for (const k of Object.keys(env)) if (/^npm_config_(cafile|ca)$/i.test(k)) delete env[k];
  assert.deepEqual(npmAuthorities({ env }).map(key), [key(tls.rootCertificates[0])]);
  assert.deepEqual(npmAuthorities({ env: { ...env, NPM_CONFIG_CAFILE: cafile } }).map(key), [key(privateCA)]);
  // An overridden, unreadable lower-priority file is not the selected trust policy.
  await writeFile(global, `cafile=${path.join(root, 'absent')}\n`);
  assert.deepEqual(npmAuthorities({ env }).map(key), [key(tls.rootCertificates[0])]);
});

it('preserves a real native npm global custom cafile and rejects unreadable configured CAs', async t => {
  const root = await temporary(t), global = path.join(root, 'global.npmrc'), user = path.join(root, 'user.npmrc');
  const cafile = path.join(root, 'corporate-ca.pem');
  await writeFile(cafile, privateCA); await writeFile(global, `cafile=${cafile}\n`); await writeFile(user, '');
  const env = { ...process.env, NPM_CONFIG_GLOBALCONFIG: global, NPM_CONFIG_USERCONFIG: user };
  for (const k of Object.keys(env)) if (/^npm_config_(cafile|ca)$/i.test(k)) delete env[k];
  assert.ok(npmAuthorities({ env }).some(pem => key(pem) === key(privateCA)));
  assert.throws(() => npmAuthorities({ env: { ...env, NPM_CONFIG_CAFILE: path.join(root, 'absent') } }), /CA configuration/);
});

it('native npm preserves a private-only CA policy even when global TLS trusts another authority', async t => {
  const root = await temporary(t), global = path.join(root, 'global.npmrc'), user = path.join(root, 'user.npmrc');
  await writeFile(global, `cafile=${path.join(fixture, 'registry-ca.pem')}\n`);
  await writeFile(user, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:npm_config_(?:ca|cafile)|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  Object.assign(env, { NPM_CONFIG_GLOBALCONFIG: global, NPM_CONFIG_USERCONFIG: user,
    NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1' });
  const settings = prepareTrust({ env, directory: root,
    bundled: [await readFile(path.join(fixture, 'other-registry-ca.pem'), 'utf8')], getCertificates: () => [] });
  assert.deepEqual(certificates(await readFile(settings.NPM_CONFIG_CAFILE, 'utf8')).map(key), [key(privateCA)]);
  for (const [filename, cafile, accepted] of [
    ['registry-server.pem', settings.NPM_CONFIG_CAFILE, true],
    ['other-registry-server.pem', settings.NPM_CONFIG_CAFILE, false],
    ['other-registry-server.pem', settings.SSL_CERT_FILE, true], // Control: the global bundle can authenticate this server.
  ]) {
    let requests = 0;
    const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
      cert: await readFile(path.join(fixture, filename)) }, (_, response) => {
      requests++; response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"fixture not found"}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      let invocation;
      runNpm(['view', 'fixture-policy-proof', 'name', '--strict-ssl=true', `--cafile=${cafile}`,
        `--registry=https://localhost:${server.address().port}`, '--fetch-retries=0', '--fetch-timeout=5000',
        `--cache=${path.join(root, filename + accepted)}`], env,
      { execute: (...args) => { invocation = args; } });
      const result = await promisify(execFile)(invocation[0], invocation[1], { ...invocation[2], timeout: 10000,
        stdio: undefined }).then(() => null, error => error);
      assert.equal(typeof result?.code, 'number', `npm must complete: ${result?.message}`);
      if (accepted) { assert.ok(requests > 0, result.stderr); assert.match(result.stderr, /E404/); }
      else { assert.equal(requests, 0); assert.match(result.stderr, /certificate|issuer/i); }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});

it('preserves inherited Git settings and enforces Schannel CA-file use, strict TLS and empty trust fallbacks', () => {
  const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'input' };
  const settings = { ...env, ...trustSettings('/filtered.pem', '/empty', env) };
  assert.equal(settings.GIT_CONFIG_COUNT, '3');
  assert.equal(settings.GIT_CONFIG_KEY_0, 'core.autocrlf');
  assert.equal(settings.GIT_CONFIG_VALUE_0, 'input');
  assert.equal(settings.GIT_CONFIG_KEY_1, 'http.schannelUseSSLCAInfo');
  assert.equal(settings.GIT_CONFIG_VALUE_1, 'true');
  assert.equal(settings.GIT_CONFIG_KEY_2, 'http.sslVerify');
  assert.equal(settings.GIT_CONFIG_VALUE_2, 'true');
  assert.equal(Object.hasOwn(settings, 'GIT_SSL_CAINFO'), false);
  assert.equal(Object.hasOwn(settings, 'GIT_SSL_CAPATH'), false);
  assert.equal(Object.hasOwn(settings, 'GIT_SSL_NO_VERIFY'), false);
  assert.equal(settings.NODE_TLS_REJECT_UNAUTHORIZED, '1');
  assert.equal(settings.NPM_CONFIG_STRICT_SSL, 'true');
  assert.equal(settings.npm_config_strict_ssl, 'true');
  const publication = publicationGitEnvironment({ ...settings, GH_TOKEN: 'fixture-only', GITHUB_SERVER_URL: 'https://fixture.example',
    GIT_SSL_NO_VERIFY: 'false', git_ssl_no_verify: '1' });
  for (const [key, value] of Object.entries(settings)) if (key !== 'GIT_CONFIG_COUNT') assert.equal(publication[key], value);
  assert.equal(publication.GIT_CONFIG_COUNT, '4');
  assert.equal(publication.GIT_CONFIG_KEY_3, 'http.https://fixture.example/.extraheader');
  assert.equal(publication.GIT_CONFIG_VALUE_3, 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:fixture-only').toString('base64'));
  assert.equal(Object.keys(publication).some(key => key.toUpperCase() === 'GIT_SSL_NO_VERIFY'), false);
  for (const value of ['-1', 'NaN', '1.5', '9007199254740991']) {
    assert.throws(() => trustSettings('ca', 'empty', { GIT_CONFIG_COUNT: value }));
    assert.throws(() => publicationGitEnvironment({ GIT_CONFIG_COUNT: value }));
  }
});

it('exports safe workflow settings without forbidden NODE_OPTIONS or environment injection', async t => {
  const root = await temporary(t), filename = path.join(root, 'env');
  exportSettings(trustSettings('/filtered.pem', '/empty'), filename);
  const text = await readFile(filename, 'utf8');
  assert.doesNotMatch(text, /NODE_OPTIONS/);
  assert.match(text, /SSL_CERT_FILE=\/filtered.pem/);
  assert.throws(() => exportSettings({ NODE_OPTIONS: '--use-openssl-ca' }, filename));
  assert.throws(() => exportSettings({ SSL_CERT_FILE: 'bad\nINJECTED=1' }, filename));
});

it('installs current npm before the exact Groma pin using native npm with explicit strict TLS', () => {
  const calls = [], settings = { NODE_EXTRA_CA_CERTS: '/global.pem', NODE_USE_SYSTEM_CA: '0', NODE_TLS_REJECT_UNAUTHORIZED: '1',
    NPM_CONFIG_CAFILE: '/private filtered.pem', npm_config_cafile: '/private filtered.pem' };
  installGroma('0.7.7', settings, { env: { HTTPS_PROXY: 'http://proxy.example', NPM_TOKEN: 'preserved', GIT_SSL_NO_VERIFY: 'false', git_ssl_no_verify: '1' },
    execute: (args, env) => { calls.push(args); assert.equal(env.HTTPS_PROXY, 'http://proxy.example');
      assert.equal(env.NPM_TOKEN, 'preserved'); assert.equal(env.NODE_OPTIONS, '--use-bundled-ca');
      assert.equal(env.GIT_SSL_NO_VERIFY, 'false'); assert.equal(env.git_ssl_no_verify, '1'); } });
  assert.deepEqual(calls, [installArguments('npm@12.2.1', settings.NPM_CONFIG_CAFILE), installArguments('groma.md@0.7.7', settings.NPM_CONFIG_CAFILE)]);
  for (const args of calls) { assert.ok(args.includes('--strict-ssl=true')); assert.ok(args.includes('--cafile=/private filtered.pem')); }
  assert.throws(() => installArguments('groma.md@0.7.7;echo unsafe', 'ca'));
  const executions = [];
  runNpm(calls[1], {}, { query: () => '/native/global modules', exists: () => true,
    execute: (...args) => executions.push(args) });
  assert.equal(executions[0][0], process.execPath);
  assert.equal(executions[0][1][0], path.join('/native/global modules', 'npm/bin/npm-cli.js'));
  assert.equal(executions[0][2].shell, undefined);
  runNpm(calls[1], {}, { query: () => '/custom/empty-prefix',
    exists: candidate => candidate === path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    execute: (...args) => executions.push(args) });
  assert.ok(executions[1][1][0].endsWith(path.join('npm', 'bin', 'npm-cli.js')));
});

it('the filtered bundle accepts a private loopback registry and rejects both compromised authentication paths', async t => {
  const ca = filterAuthorities([...incidents.map(c => c.pem), privateCA]);
  const key = await readFile(path.join(fixture, 'registry-server-key.pem'));
  for (const filename of ['registry-server.pem', 'incident-server-emudhra.pem', 'incident-server-aaa.pem']) {
    const server = https.createServer({ key, cert: await readFile(path.join(fixture, filename)) }, (_req, res) => res.end('ok'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = new Promise((resolve, reject) => {
        https.get({ hostname: '127.0.0.1', servername: 'localhost', port: server.address().port, ca }, res => {
          res.resume(); res.on('end', () => resolve(res.statusCode));
        }).on('error', reject);
      });
      if (filename === 'registry-server.pem') assert.equal(await response, 200);
      else await assert.rejects(response, /certificate|issuer|revoked/i);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});

it('all four workflow entry points embed the exact offline bootstrap before network steps', async () => {
  const source = (await readFile(new URL('../trust-bootstrap.cjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const expected = source.slice(0, source.indexOf('module.exports =')) + 'exportSettings(prepareTrust(), process.env.GITHUB_ENV);\n';
  for (const filename of ['.github/workflows/check.yml', '.github/workflows/groma-demo.yml', 'examples/pages.yml', 'examples/pull-request.yml']) {
    const content = (await readFile(new URL('../' + filename, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    const inline = content.match(/          node <<'NODE'\n([\s\S]+?)          NODE\n/)[1].split('\n').map(line => line.slice(10)).join('\n');
    assert.equal(inline.trim(), expected.trim(), filename);
    assert.match(content, /NODE_OPTIONS: --use-openssl-ca/);
    assert.ok(content.indexOf('- &prepare-trust') < content.indexOf('uses:'));
  }
  const check = (await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(check, /release:\n    types: \[published\]/);
  assert.equal((check.match(/ref: \$\{\{ github\.sha \}\}/g) ?? []).length, 2);
  const tagJob = check.split('\n  release-tag:\n')[1];
  assert.match(tagJob, /needs: \[check, release-smoke\]/);
  assert.match(tagJob, /!github.event.release.draft && !github.event.release.prerelease/);
  assert.match(tagJob, /contents: write/);
  assert.equal((check.match(/contents: write/g) ?? []).length, 1);
  assert.match(tagJob, /cancel-in-progress: false/);
  assert.match(tagJob, /object.sha !== process.env.GITHUB_SHA/);
  assert.match(tagJob, /latest.id !== release.id/);
  const allowedTag = new RegExp(tagJob.match(/const match = \/(.+)\/\.exec\(tag\)/)[1]);
  for (const tag of ['v1.0.0', 'v1.2.2', 'v1.20.10']) assert.ok(allowedTag.test(tag));
  for (const tag of ['v2.0.0', 'v1.02.2', 'v1.2.2-rc.1', 'v1.2.2/unsafe']) assert.equal(allowedTag.test(tag), false);
  assert.match(tagJob, /api\('git\/refs\/tags\/v1', 'PATCH', \{ sha: object.sha, force: false \}\)/);
  assert.match(tagJob, /ref: 'refs\/tags\/v1'/);
  assert.doesNotMatch(tagJob, /force: true/);
});


it('native Git reaches the private-CA mock 404 and sends no HTTP request through either compromised chain', async t => {
  const root = await temporary(t), cafile = path.join(root, 'filtered.pem'), empty = path.join(root, 'empty');
  await writeFile(cafile, filterAuthorities([...incidents.map(c => c.pem), privateCA]));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(empty);
  const key = await readFile(path.join(fixture, 'registry-server-key.pem'));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  // Isolated tests suppress only Schannel's online revocation lookup for these synthetic leaves.
  // Production revocation policy is unchanged. NOSYSTEM hides Git for Windows' backend selection.
  const platform = process.platform === 'win32'
    ? ['-c', 'http.sslBackend=schannel', '-c', 'http.schannelCheckRevoke=false'] : [];
  for (const { filename, suffix } of ['registry-server.pem', 'incident-server-emudhra.pem', 'incident-server-aaa.pem']
    .flatMap(filename => ['', '.git'].map(suffix => ({ filename, suffix })))) {
    let requests = 0;
    let authorization;
    let commandHeader;
    const pem = await readFile(path.join(fixture, filename));
    const leaf = new X509Certificate(pem);
    assert.ok(Date.parse(leaf.validFrom) <= Date.now() && Date.now() < Date.parse(leaf.validTo), `${filename} must be currently valid`);
    const server = https.createServer({ key, cert: pem }, (req, res) => {
      authorization = req.headers.authorization;
      commandHeader = req.headers['user-agent'];
      requests++; res.writeHead(404); res.end('mock repository not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const remote = `https://localhost:${server.address().port}/owner/fixture${suffix}`;
      const unfiltered = path.join(root, 'unfiltered.pem');
      await writeFile(unfiltered, [...incidents.map(c => c.pem), privateCA].join('\n'));
      const baseline = await promisify(execFile)('git', [...platform, '-c', 'http.sslVerify=true',
        '-c', 'http.schannelUseSSLCAInfo=true', 'ls-remote', remote], { timeout: 10000,
        env: { ...clean, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'),
          GIT_SSL_CAINFO: unfiltered, GIT_SSL_CAPATH: empty, NO_PROXY: '127.0.0.1,localhost',
          GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      }).then(() => null, error => error);
      assert.ok(Number.isInteger(baseline?.code) && !baseline.killed, baseline?.message);
      assert.ok(requests > 0, `The unfiltered strict-TLS control must reach HTTP: ${baseline?.stderr}`);
      assert.match(baseline.stderr, /not found|404/i);
      requests = 0;
      const inherited = { ...clean,
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `http.${remote}.sslVerify`, GIT_CONFIG_VALUE_0: 'false',
        GIT_CONFIG_PARAMETERS: `'http.${remote}.sslVerify'='false' 'http.userAgent'='Fixture-Command-Scope'`,
        GITHUB_SERVER_URL: `https://localhost:${server.address().port}`, GITHUB_REPOSITORY: 'owner/fixture',
        GH_TOKEN: 'fixture-only', GIT_SSL_NO_VERIFY: 'false' };
      const env = publicationGitEnvironment({ ...inherited, ...trustSettings(cafile, empty, inherited),
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'),
        NO_PROXY: '127.0.0.1,localhost', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
        GIT_TRACE_CURL: '1', GIT_TRACE_CURL_NO_DATA: '1' });
      const result = await promisify(execFile)('git', [...platform, 'ls-remote', remote],
        { env, timeout: 10000 }).then(() => null, error => error);
      const diagnostic = `${filename}${suffix || ' (no suffix)'}: code=${result?.code}, signal=${result?.signal}, killed=${result?.killed}, requests=${requests}\n${result?.stderr || ''}`;
      assert.ok(Number.isInteger(result?.code) && result.code !== 0 && !result.killed,
        'The mock 404 or certificate rejection must stop Git. ' + diagnostic);
      if (filename === 'registry-server.pem') {
        assert.ok(requests > 0, 'The private CA must reach the HTTP mock: ' + result.stderr);
        assert.match(result.stderr, /not found|404/i);
        assert.equal(authorization, 'basic ' + Buffer.from('x-access-token:fixture-only').toString('base64'));
        assert.equal(commandHeader, 'Fixture-Command-Scope');
      } else {
        assert.equal(requests, 0, `${filename} must fail before any HTTP request`);
        assert.match(result.stderr, /certificate|SSL|issuer|trust|schannel|revok/i);
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});


it('keeps native Git private CA selection for GitHub and unrelated remotes without exporting a global default', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig');
  const ca = path.join(root, "operator's-ca.pem");
  await writeFile(ca, [...incidents.map(c => c.pem), privateCA].join('\n'));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    NO_PROXY: '127.0.0.1,localhost', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  const platform = process.platform === 'win32'
    ? ['-c', 'http.sslBackend=schannel', '-c', 'http.schannelCheckRevoke=false'] : [];
  for (const mode of ['github', 'unrelated', 'explicit']) {
    let requests = 0;
    const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
      cert: await readFile(path.join(fixture, 'registry-server.pem')) }, (_, response) => {
      requests++; response.writeHead(404); response.end('mock repository not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = `https://localhost:${server.address().port}`, remote = `${origin}/owner/fixture`;
      await writeFile(config, `[http "${remote}"]\n sslCAInfo = ${JSON.stringify(ca)}\n`);
      const env = { ...clean, GIT_PROXY_SSL_CAINFO: path.join(root, 'unused-missing-proxy-ca.pem'),
        GITHUB_SERVER_URL: mode === 'unrelated' ? 'https://github.com' : origin,
        GITHUB_REPOSITORY: 'owner/fixture', ...(mode === 'explicit' ? { GIT_SSL_CAINFO: ca } : {}) };
      const directory = path.join(root, mode);
      const { mkdir } = await import('node:fs/promises'); await mkdir(directory);
      const settings = prepareTrust({ env, directory, bundled: [tls.rootCertificates[0]], npmInputs: null });
      assert.equal(Object.hasOwn(settings, 'GIT_SSL_CAINFO'), mode === 'explicit');
      const child = { ...env, ...settings };
      if (mode === 'unrelated') {
        const old = await promisify(execFile)('git', [...platform, 'ls-remote', remote], {
          env: { ...child, GIT_SSL_CAINFO: settings.SSL_CERT_FILE, GIT_SSL_CAPATH: settings.SSL_CERT_DIR }, timeout: 10000,
        }).then(() => null, error => error);
        assert.ok(Number.isInteger(old?.code) && !old.killed, old?.message);
        assert.equal(requests, 0, 'The former global override must reproduce the private Git regression.');
        assert.match(old.stderr, /certificate|SSL|issuer|trust|schannel/i);
      }
      if (mode !== 'unrelated') {
        const selected = mode === 'explicit' ? settings.GIT_SSL_CAINFO
          : (await promisify(execFile)('git', ['config', '--get-urlmatch', 'http.sslCAInfo', remote], { env: child })).stdout.trim();
        assert.deepEqual(certificates(await readFile(selected, 'utf8')).map(key), [key(privateCA)]);
      }
      const result = await promisify(execFile)('git', [...platform, 'ls-remote', remote], { env: child, timeout: 10000 })
        .then(() => null, error => error);
      assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
      assert.ok(requests > 0, `${mode}: ${result?.stderr}`);
      assert.match(result.stderr, /404|not found/i);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});

it('does not turn Node-only extra CAs into default Git authorities', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy|ssl_cert_(?:file|dir)|curl_ca_bundle|node_extra_ca_certs)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  let requests = 0, authorization;
  const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
    cert: await readFile(path.join(fixture, 'registry-server.pem')) }, (request, response) => {
    requests++; authorization = request.headers.authorization;
    response.writeHead(404); response.end('fixture repository not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `https://localhost:${server.address().port}`, remote = `${origin}/owner/fixture.git`;
    await writeFile(config, `[http "${remote}"]\n extraHeader=Authorization: Bearer node-extra-fixture\n`);
    const env = { ...clean, NODE_EXTRA_CA_CERTS: path.join(fixture, 'registry-ca.pem'),
      GITHUB_SERVER_URL: origin, GITHUB_REPOSITORY: 'owner/fixture' };
    const platform = process.platform === 'win32' ? ['-c', 'http.sslBackend=schannel',
      '-c', 'http.schannelUseSSLCAInfo=true', '-c', 'http.schannelCheckRevoke=false'] : [];
    const execute = child => promisify(execFile)('git', [...platform, 'ls-remote', remote],
      { env: child, cwd: root, timeout: 10000 }).then(() => null, error => error);
    const before = await execute(env);
    assert.ok(Number.isInteger(before?.code) && !before.killed, before?.message);
    assert.match(before.stderr, /certificate|SSL|issuer|trust|schannel/i);
    assert.equal(requests, 0, before.stderr);
    const settings = prepareTrust({ env, directory: root, npmInputs: null });
    assert.ok(certificates(await readFile(settings.SSL_CERT_FILE, 'utf8')).some(pem => key(pem) === key(privateCA)),
      'The extra CA remains available to Node under its own policy.');
    const result = await execute({ ...env, ...settings });
    assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
    assert.equal(requests, 0, `Git must not gain a Node-only CA; authSent=${authorization !== undefined}: ${result.stderr}`);
    assert.equal(authorization, undefined);
    assert.match(result.stderr, /certificate|SSL|issuer|trust|schannel/i);
    const selected = (await promisify(execFile)('git', ['config', '--get-urlmatch', 'http.sslCAInfo', remote],
      { env: { ...env, ...settings }, cwd: root })).stdout.trim();
    assert.ok(!certificates(await readFile(selected, 'utf8')).some(pem => key(pem) === key(privateCA)));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

it('filters the actual Git rewrite destination without exporting rewritten passwords', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig'), ca = path.join(root, 'raw.pem');
  await writeFile(ca, [privateCA, ...incidents.map(c => c.pem)].join('\n'));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  const alias = 'https://rewrite-fixture.invalid', password = 'rewritten-fixture-secret', username = "it's=enterprise";
  const platform = process.platform === 'win32' ? ['-c', 'http.sslBackend=openssl'] : [];
  for (const helper of ['', 'https::']) for (const filename of
    ['registry-server.pem', 'incident-server-emudhra.pem', 'incident-server-aaa.pem']) {
    let requests = 0, authorization;
    const cert = await readFile(path.join(fixture, filename)), leaf = new X509Certificate(cert), now = Date.now();
    assert.ok(Date.parse(leaf.validFrom) <= now && now < Date.parse(leaf.validTo), `${filename} must be currently valid`);
    const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')), cert }, (request, response) => {
      requests++; authorization = request.headers.authorization;
      response.writeHead(404); response.end('fixture repository not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const target = `https://${username}:${password}@localhost:${server.address().port}/`;
      const scope = `https://${username}@localhost:${server.address().port}/owner/`;
      await writeFile(config, `[url "${helper}${target}"]\n insteadOf=${alias}/\n[http "${scope}"]\n sslCAInfo=${JSON.stringify(ca)}\n[http]\n extraHeader=Authorization: Bearer rewrite-fixture\n`);
      const env = { ...clean, GITHUB_SERVER_URL: alias, GITHUB_REPOSITORY: 'owner/fixture' };
      const settings = prepareTrust({ env, directory: path.join(root, `${helper ? 'forced' : 'normal'}-${filename}`), npmInputs: null });
      assert.ok(!JSON.stringify(settings).includes(password), 'Rewritten passwords must not enter exported settings.');
      for (const suffix of ['', '.git']) {
        const remote = `${alias}/owner/fixture${suffix}`;
        const execute = child => promisify(execFile)('git', [...platform, 'ls-remote', remote],
          { env: child, cwd: root, timeout: 10000 }).then(() => null, error => error);
        requests = 0; authorization = undefined;
        const before = await execute(env);
        assert.ok(Number.isInteger(before?.code) && !before.killed, before?.message);
        assert.ok(requests > 0, `${helper}/${filename}${suffix}: ${before?.stderr}`);
        assert.equal(authorization, 'Bearer rewrite-fixture');
        requests = 0; authorization = undefined;
        const result = await execute({ ...env, ...settings });
        assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
        if (filename === 'registry-server.pem') {
          assert.ok(requests > 0, result?.stderr);
          assert.equal(authorization, 'Bearer rewrite-fixture');
          assert.match(result.stderr, /404|not found/i);
        } else {
          assert.equal(requests, 0, `${helper}/${filename}${suffix}: ${result?.stderr}`);
          assert.equal(authorization, undefined);
          assert.match(result.stderr, /certificate|SSL|issuer|trust|schannel|revok/i);
        }
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});

it('filters explicit Git CA directories while preserving native filenames and rejects empty selected files', async t => {
  const root = await temporary(t), source = path.join(root, 'source'), output = path.join(root, 'output');
  const { mkdir } = await import('node:fs/promises'); await mkdir(source); await mkdir(output);
  await writeFile(path.join(source, '1234abcd.0'), incidents[0].pem);
  await writeFile(path.join(source, '1234abcd.1'), privateCA);
  await writeFile(path.join(source, '1234abcd.3'), tls.rootCertificates[0]);
  await writeFile(path.join(source, 'unrelated.pem'), tls.rootCertificates[1]);
  const settings = prepareTrust({ env: { GIT_SSL_CAPATH: source }, directory: output,
    bundled: [privateCA], getCertificates: () => [], npmInputs: null });
  assert.deepEqual((await readdir(settings.GIT_SSL_CAPATH)).sort(), ['1234abcd.0', '1234abcd.1', '1234abcd.3', 'unrelated.pem']);
  assert.deepEqual(certificates(await readFile(path.join(settings.GIT_SSL_CAPATH, '1234abcd.0'), 'utf8')).map(key), [key(privateCA)]);
  assert.throws(() => prepareTrust({ env: { GIT_SSL_CAINFO: '' }, directory: output,
    bundled: [privateCA], getCertificates: () => [], npmInputs: null }), /Git CA file is empty/);
});

it('Pages publication rejects a separate native push rewrite before either remote receives credentials', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig'), ca = path.join(root, 'raw-ca.pem');
  await writeFile(ca, [...incidents.map(c => c.pem), privateCA].join('\n'));
  const servers = [];
  for (const filename of ['registry-server.pem', 'incident-server-emudhra.pem']) {
    const peer = { requests: 0, authenticated: 0 };
    peer.server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
      cert: await readFile(path.join(fixture, filename)) }, (request, response) => {
      peer.requests++; if (request.headers.authorization) peer.authenticated++;
      response.writeHead(404); response.end('fixture');
    });
    await new Promise(resolve => peer.server.listen(0, '127.0.0.1', resolve));
    peer.origin = `https://localhost:${peer.server.address().port}`; servers.push(peer);
  }
  const original = { ...process.env }, [origin, push] = servers;
  const clean = Object.fromEntries(Object.entries(original).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_.*|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  const env = { ...clean, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, RUNNER_TEMP: root,
    GITHUB_SERVER_URL: origin.origin, GITHUB_REPOSITORY: 'owner/fixture', GH_TOKEN: 'fixture-only',
    NO_PROXY: '127.0.0.1,localhost', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };
  const git = args => promisify(execFile)('git', args, { cwd: root, env, timeout: 10000 });
  const base = `[http]\n sslVerify = true\n${process.platform === 'win32' ? ' sslBackend = openssl\n' : ''}`
    + `[http "${origin.origin}/"]\n sslCAInfo = ${JSON.stringify(ca)}\n`
    + `[http "${push.origin}/"]\n sslCAInfo = ${JSON.stringify(ca)}\n extraHeader = Authorization: Bearer fixture-only\n`;
  try {
    await writeFile(config, base + `[url "${push.origin}/"]\n pushInsteadOf = ${origin.origin}/\n`);
    await git(['init', '--quiet']);
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
    await git(['remote', 'add', 'origin', `${origin.origin}/owner/fixture.git`]);
    const settings = prepareTrust({ env, npmInputs: null });
    const raw = await promisify(execFile)('git', ['push', 'origin', 'HEAD'], { cwd: root,
      env: { ...env, ...settings }, timeout: 10000 }).then(() => null, error => error);
    assert.ok(Number.isInteger(raw?.code) && !raw.killed, raw?.message);
    assert.match(raw.stderr, /404|not found/i);
    assert.ok(push.requests > 0 && push.authenticated > 0, 'The unguarded strict-TLS push must prove the destination bypass.');
    push.requests = 0; push.authenticated = 0;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env, settings);
    await assert.rejects(storeSite({}), /same Git fetch and push URL/);
    assert.equal(origin.requests + push.requests, 0);
    assert.equal(origin.authenticated + push.authenticated, 0);
    // Matching native fetch/push URLs still reach the selected private HTTPS origin.
    await writeFile(config, base);
    await assert.rejects(storeSite({}), /404|not found/i);
    assert.ok(origin.requests > 0 && origin.authenticated > 0);
    assert.equal(push.requests, 0);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    for (const peer of servers) { peer.server.closeAllConnections(); await new Promise(resolve => peer.server.close(resolve)); }
  }
});

it('preserves native Git CA-directory layouts and keeps the selected CA file additive', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig');
  const { mkdir, symlink } = await import('node:fs/promises');
  const otherCA = path.join(fixture, 'other-registry-ca.pem');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy|ssl_cert_(?:file|dir)|curl_ca_bundle|node_extra_ca_certs)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    NO_PROXY: '127.0.0.1,localhost', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  const platform = process.platform === 'win32' ? ['-c', 'http.sslBackend=openssl'] : [];
  // Match the actual backend: GnuTLS reads ordinary files; OpenSSL uses subject hashes.
  const layouts = ['private.crt', 'private.pem', 'private', '81ee7702.0', '81ee7702.1', '1234abcd.0', 'multi-pem-gap', 'unrecognized-prefix', 'empty-prefix', 'blocked-then-unrecognized', 'trusted-hash', 'rejected-hash', 'malformed-sidecar'];
  if (process.platform !== 'win32') layouts.push('dangling-symlink', 'dangling-hash-gap');
  for (const basename of layouts) {
    const source = path.join(root, basename); await mkdir(source);
    if (basename === 'malformed-sidecar') {
      await writeFile(path.join(source, '81ee7702.0'), privateCA);
      await writeFile(path.join(source, 'malformed.pem'), ['-----BEGIN CERTIFICATE-----', 'invalid!', '-----END CERTIFICATE-----'].join('\n'));
    } else if (basename === 'trusted-hash' || basename === 'rejected-hash') {
      await writeFile(path.join(source, '81ee7702.0'), await readFile(path.join(fixture,
        basename === 'trusted-hash' ? 'trusted-registry-ca.pem' : 'rejected-registry-ca.pem')));
    } else if (basename === 'dangling-symlink') {
      await writeFile(path.join(source, '81ee7702.0'), privateCA);
      await symlink(path.join(source, 'absent'), path.join(source, 'unrelated.pem'));
    } else if (basename === 'dangling-hash-gap') {
      await symlink(path.join(source, 'absent'), path.join(source, '81ee7702.0'));
      await writeFile(path.join(source, '81ee7702.1'), privateCA);
    } else if (basename === 'blocked-then-unrecognized') {
      await writeFile(path.join(source, '81ee7702.0'), incidents[0].pem);
      await writeFile(path.join(source, '81ee7702.1'), 'not PEM');
      await writeFile(path.join(source, '81ee7702.2'), privateCA);
    } else if (basename === 'unrecognized-prefix' || basename === 'empty-prefix') {
      await writeFile(path.join(source, '81ee7702.0'), basename === 'empty-prefix' ? '' : 'not PEM');
      await writeFile(path.join(source, '81ee7702.1'), privateCA);
    } else if (basename === 'multi-pem-gap') {
      await writeFile(path.join(source, '81ee7702.0'), (await readFile(otherCA, 'utf8')) + '\n' + tls.rootCertificates[0]);
      await writeFile(path.join(source, '81ee7702.2'), privateCA);
    } else await writeFile(path.join(source, basename), privateCA);
    for (const mode of ['environment', 'url']) for (const filename of ['registry-server.pem', 'other-registry-server.pem']) {
      let requests = 0, authorization;
      const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
        cert: await readFile(path.join(fixture, filename)) }, (request, response) => {
        requests++; authorization = request.headers.authorization; response.writeHead(404); response.end('fixture');
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const origin = `https://localhost:${server.address().port}`, remote = `${origin}/owner/fixture`;
        await writeFile(config, `[http "${remote}"]\n extraHeader = Authorization: Bearer fixture-only\n`
          + (mode === 'url' ? ` sslCAPath = ${JSON.stringify(source)}\n` : ''));
        const env = { ...clean, GITHUB_SERVER_URL: origin, GITHUB_REPOSITORY: 'owner/fixture',
          GIT_SSL_CAINFO: otherCA, ...(mode === 'environment' ? { GIT_SSL_CAPATH: source } : {}) };
        const run = child => promisify(execFile)('git', [...platform, 'ls-remote', remote], { env: child, timeout: 10000 })
          .then(() => null, error => error);
        const before = await run(env);
        assert.ok(Number.isInteger(before?.code) && !before.killed, before?.message);
        const nativeAccepted = requests > 0;
        if (filename === 'other-registry-server.pem' || basename === '81ee7702.0') {
          assert.ok(nativeAccepted, before.stderr);
          assert.equal(authorization, 'Bearer fixture-only');
        }
        requests = 0; authorization = undefined;
        const directory = path.join(root, `${basename}-${mode}-${filename}`); await mkdir(directory);
        const settings = prepareTrust({ env, directory, bundled: [tls.rootCertificates[0]], npmInputs: null });
        if (basename === 'dangling-hash-gap') {
          const selectedDirectory = mode === 'environment' ? settings.GIT_SSL_CAPATH
            : (await promisify(execFile)('git', ['config', '--get-urlmatch', 'http.sslCAPath', remote], { env: { ...env, ...settings } })).stdout.trim();
          assert.equal((await readdir(selectedDirectory)).includes('81ee7702.0'), false);
        }
        const result = await run({ ...env, ...settings });
        assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
        assert.equal(requests > 0, nativeAccepted, `${basename}/${mode}/${filename}: ${result.stderr}`);
        assert.equal(authorization, nativeAccepted ? 'Bearer fixture-only' : undefined);
        assert.match(result.stderr, nativeAccepted ? /404|not found/i : /certificate|SSL|issuer|trust/i);
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    }
  }
});

it('keeps malformed selected Git CA files and hash entries strict', async t => {
  const root = await temporary(t), source = path.join(root, 'selected');
  const { mkdir } = await import('node:fs/promises'); await mkdir(source);
  const ca = path.join(source, '81ee7702.0');
  await writeFile(ca, ['-----BEGIN CERTIFICATE-----', 'invalid!', '-----END CERTIFICATE-----'].join('\n'));
  for (const env of [{ GIT_SSL_CAINFO: ca }, { GIT_SSL_CAPATH: source }]) {
    assert.throws(() => prepareTrust({ env, bundled: [privateCA], getCertificates: () => [], npmInputs: null }), /PEM|base64|certificate/i);
  }
});

it('retains OpenSSL AUX trust directives without merging different certificate policies', async () => {
  const trusted = (await readFile(path.join(fixture, 'trusted-registry-ca.pem'), 'utf8')).trim();
  const rejected = (await readFile(path.join(fixture, 'rejected-registry-ca.pem'), 'utf8')).trim();
  const incident = await readFile(path.join(fixture, 'trusted-compromised-cas.pem'), 'utf8');
  const actual = certificates(filterAuthorities([trusted, rejected, privateCA, trusted]));
  assert.equal(actual.length, 3);
  assert.equal(actual[0], trusted);
  assert.equal(actual[1], rejected);
  assert.equal(actual[2].startsWith('-----BEGIN CERTIFICATE-----'), true);
  assert.deepEqual(certificates(filterAuthorities([incident, trusted])), [trusted]);
  assert.throws(() => filterAuthorities([incident]), /No trusted certificate/);
});

it('matches native Git trusted-PEM acceptance and AUX rejection while excluding incident keys', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig'), ca = path.join(root, 'selected.pem');
  const { mkdir } = await import('node:fs/promises'); await mkdir(path.join(root, 'empty'));
  const trusted = await readFile(path.join(fixture, 'trusted-registry-ca.pem'), 'utf8');
  const rejected = await readFile(path.join(fixture, 'rejected-registry-ca.pem'), 'utf8');
  const incident = await readFile(path.join(fixture, 'trusted-compromised-cas.pem'), 'utf8');
  const policies = [trusted, rejected, rejected + '\n' + trusted, trusted + '\n' + rejected, incident + '\n' + trusted];
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_.*|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy|ssl_cert_(?:file|dir)|curl_ca_bundle|node_extra_ca_certs)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    NO_PROXY: '127.0.0.1,localhost', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
    GIT_SSL_CAINFO: ca, GIT_SSL_CAPATH: path.join(root, 'empty') });
  await writeFile(config, `[http]\n sslVerify = true\n extraHeader = Authorization: Bearer trusted-fixture\n`
    + (process.platform === 'win32' ? ' sslBackend = openssl\n' : ''));
  for (const [index, policy] of policies.entries()) {
    await writeFile(ca, policy);
    for (const filename of ['registry-server.pem', 'incident-server-emudhra.pem', 'incident-server-aaa.pem']) {
      let requests = 0, authorization;
      const server = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
        cert: await readFile(path.join(fixture, filename)) }, (request, response) => {
        requests++; authorization = request.headers.authorization; response.writeHead(404); response.end('fixture');
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const origin = `https://localhost:${server.address().port}`, remote = `${origin}/owner/fixture`;
        const env = { ...clean, GITHUB_SERVER_URL: origin, GITHUB_REPOSITORY: 'owner/fixture' };
        const run = child => promisify(execFile)('git', ['ls-remote', remote], { env: child, timeout: 10000 })
          .then(() => null, error => error);
        const raw = await run(env);
        assert.ok(Number.isInteger(raw?.code) && !raw.killed, raw?.message);
        const nativeAccepted = requests > 0;
        requests = 0; authorization = undefined;
        const directory = path.join(root, `${index}-${filename}`); await mkdir(directory);
        const settings = prepareTrust({ env, directory, npmInputs: null });
        const result = await run({ ...env, ...settings });
        const accepted = filename === 'registry-server.pem' && nativeAccepted;
        assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
        assert.equal(requests > 0, accepted, `${index}/${filename}: ${result.stderr}`);
        assert.equal(authorization, accepted ? 'Bearer trusted-fixture' : undefined);
        assert.match(result.stderr, accepted ? /404|not found/i : /certificate|SSL|issuer|trust/i);
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    }
  }
});

it('uses only filtered OS authorities for a directory-only Git default CA file', async t => {
  const root = await temporary(t), source = path.join(root, 'selected-ca');
  const { mkdir } = await import('node:fs/promises'); await mkdir(source);
  await writeFile(path.join(source, '81ee7702.0'), privateCA);
  const osCA = await readFile(path.join(fixture, 'other-registry-ca.pem'), 'utf8');
  const env = { GITHUB_SERVER_URL: 'https://example.invalid', GITHUB_REPOSITORY: 'owner/fixture',
    GIT_SSL_CAPATH: source, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(root, 'absent') };
  const settings = prepareTrust({ env, directory: root, bundled: [privateCA], npmInputs: null,
    getCertificates: kind => kind === 'system' ? [osCA, incidents[0].pem] : [privateCA] });
  const child = { ...env, ...settings };
  const { stdout } = await promisify(execFile)('git', ['config', '--get-urlmatch', 'http.sslCAInfo',
    'https://example.invalid/owner/fixture'], { env: child });
  assert.deepEqual(certificates(await readFile(stdout.trim(), 'utf8')).map(key), [key(osCA)]);
  assert.deepEqual(certificates(await readFile(path.join(settings.GIT_SSL_CAPATH, '81ee7702.0'), 'utf8')).map(key), [key(privateCA)]);
});

it('native Git parses strict URL configuration with equals and apostrophes while preserving inherited command scope', async () => {
  const env = { ...process.env, GITHUB_SERVER_URL: "https://example.invalid/it's=enterprise", GITHUB_REPOSITORY: 'owner/fixture',
    GIT_CONFIG_COUNT: '0', GIT_CONFIG_PARAMETERS: "'http.userAgent'='Original-Caller'" };
  const child = { ...env, ...trustSettings("/operator's=filtered.pem", '/empty', env) };
  const execute = promisify(execFile);
  assert.equal((await execute('git', ['config', '--get-urlmatch', 'http.sslVerify',
    "https://example.invalid/it's=enterprise/owner/fixture"], { env: child })).stdout.trim(), 'true');
  assert.equal((await execute('git', ['config', '--get', 'http.userAgent'], { env: child })).stdout.trim(), 'Original-Caller');
});


it('native Git blocks HTTPS proxies before CONNECT or credentials, including both incident chains', async t => {
  const root = await temporary(t), raw = path.join(root, 'raw-proxy-ca.pem'), config = path.join(root, 'gitconfig');
  const originCA = path.join(fixture, 'other-registry-ca.pem');
  await writeFile(raw, [...incidents.map(c => c.pem), privateCA].join('\n'));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    NO_PROXY: '', no_proxy: '', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  const remote = 'https://fixture-origin.invalid/owner/fixture.git';
  const backends = process.platform === 'win32' ? ['openssl', 'schannel'] : [undefined];
  for (const [backend, mode] of backends.flatMap(backend =>
    ['environment', 'url', 'invalid', 'default'].map(mode => [backend, mode]))) {
    const platform = backend ? ['-c', `http.sslBackend=${backend}`, '-c', 'http.schannelCheckRevoke=false'] : [];
    for (const filename of mode === 'default' ? ['registry-server.pem']
      : ['registry-server.pem', 'incident-server-emudhra.pem', 'incident-server-aaa.pem']) {
      let requests = 0, authorization;
      const pem = await readFile(path.join(fixture, filename)), leaf = new X509Certificate(pem), now = Date.now();
      assert.ok(Date.parse(leaf.validFrom) <= now && now < Date.parse(leaf.validTo), `${filename} must be currently valid`);
      const sockets = new Set();
      const server = tls.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')), cert: pem }, socket => {
        let headers = '';
        socket.on('data', data => {
          headers += data.toString();
          if (!headers.includes('\r\n\r\n')) return;
          requests++;
          authorization = /proxy-authorization:\s*([^\r\n]+)/i.exec(headers)?.[1];
          socket.removeAllListeners('data');
          socket.end('HTTP/1.1 502 Fixture proxy\r\nContent-Length: 0\r\n\r\n');
        });
      });
      server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      server.on('tlsClientError', () => {});
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const directory = path.join(root, `${backend ?? 'native'}-${mode}-${filename}`);
        const proxy = `https://fixture-user:fixture-password@localhost:${server.address().port}`;
        await writeFile(config, mode === 'url' ? `[http "${remote}"]\n proxySSLCAInfo = ${JSON.stringify(raw)}\n` : '');
        const args = [...platform, '-c', `http.proxy=${proxy}`, '-c', 'http.proxyAuthMethod=basic', 'ls-remote', remote];
        const env = { ...clean, GIT_SSL_CAINFO: originCA, GITHUB_SERVER_URL: 'https://fixture-origin.invalid',
          GITHUB_REPOSITORY: 'owner/fixture', ...(mode === 'default' ? {} : {
            GIT_PROXY_SSL_CAINFO: mode === 'environment' ? raw : mode === 'invalid' ? path.join(root, 'missing-proxy-ca.pem') : undefined,
          }) };
        if (process.platform === 'win32' && mode === 'environment') {
          env.git_proxy_ssl_cainfo = env.GIT_PROXY_SSL_CAINFO; delete env.GIT_PROXY_SSL_CAINFO;
        }
        // Strict unfiltered control: the proxy receives credentials before origin TLS begins.
        // Windows uses its real Git OpenSSL backend for this paired proof: Schannel
        // may already revoke incident keys independently of the application's policy.
        if (backend !== 'schannel') {
          const before = await promisify(execFile)('git', args, { env: { ...env, GIT_PROXY_SSL_CAINFO: raw }, timeout: 10000 })
            .then(() => null, error => error);
          assert.ok(Number.isInteger(before?.code) && !before.killed, before?.message);
          assert.ok(requests > 0, `${backend}/${mode}/${filename}: ${before?.stderr}`);
          assert.equal(authorization, 'Basic ' + Buffer.from('fixture-user:fixture-password').toString('base64'));
        }
        requests = 0; authorization = undefined;
        const settings = prepareTrust({ env, directory, npmInputs: null,
          bundled: [mode === 'default' ? privateCA : tls.rootCertificates[0]], getCertificates: () => [] });
        const child = { ...env, ...settings };
        assert.deepEqual(certificates(await readFile(settings.GIT_SSL_CAINFO, 'utf8')).map(key),
          [key(await readFile(originCA, 'utf8'))], 'Origin private trust must remain exclusive and independent.');
        const result = await promisify(execFile)('git', args, { env: child, timeout: 10000 }).then(() => null, error => error);
        assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
        assert.equal(requests, 0, `${mode}/${filename}: ${result?.stderr}`);
        assert.equal(authorization, undefined);
        assert.equal((await readFile(path.dirname(settings.GIT_PROXY_SSL_CAINFO))).length, 0);
        await assert.rejects(readFile(settings.GIT_PROXY_SSL_CAINFO), /ENOTDIR|ENOENT/);
        assert.match(result.stderr, /certificate|SSL|issuer|trust|schannel|revok/i);
        if (backend === 'schannel') {
          // Require the owned-path loader failure, rather than ambient OS revocation.
          assert.ok(result.stderr.replaceAll('\\', '/').toLowerCase()
            .includes(settings.GIT_PROXY_SSL_CAINFO.replaceAll('\\', '/').toLowerCase()), result.stderr);
        }
      } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
    }
  }
});


it('native Git retains authenticated HTTP CONNECT proxies and verified private-origin TLS', async t => {
  const root = await temporary(t), config = path.join(root, 'gitconfig');
  await writeFile(config, '');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:git_config(?:_.+)?|git_ssl_(?:no_verify|cainfo|capath)|git_proxy_ssl_cainfo|https?_proxy|all_proxy|no_proxy)$/i.test(name)));
  Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, NO_PROXY: '', no_proxy: '',
    GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' });
  let requests = 0, tunnels = 0, authorization;
  const origin = https.createServer({ key: await readFile(path.join(fixture, 'registry-server-key.pem')),
    cert: await readFile(path.join(fixture, 'registry-server.pem')) }, (_, response) => {
    requests++; response.writeHead(404); response.end('mock repository not found');
  });
  const sockets = new Set(), proxy = http.createServer();
  proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  proxy.on('connect', (request, socket, head) => {
    tunnels++; authorization = request.headers['proxy-authorization'];
    const upstream = net.connect(origin.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const remote = `https://localhost:${origin.address().port}/owner/fixture.git`;
    const env = { ...clean, GITHUB_SERVER_URL: `https://localhost:${origin.address().port}`, GITHUB_REPOSITORY: 'owner/fixture',
      GIT_SSL_CAINFO: path.join(fixture, 'registry-ca.pem'), GIT_PROXY_SSL_CAINFO: path.join(root, 'unused-absent-proxy-ca.pem') };
    const settings = prepareTrust({ env, directory: root, bundled: [tls.rootCertificates[0]], getCertificates: () => [], npmInputs: null });
    const platform = process.platform === 'win32'
      ? ['-c', 'http.sslBackend=schannel', '-c', 'http.schannelCheckRevoke=false'] : [];
    const result = await promisify(execFile)('git', [...platform, '-c', 'http.proxyAuthMethod=basic',
      '-c', `http.proxy=http://fixture-user:fixture-password@127.0.0.1:${proxy.address().port}`, 'ls-remote', remote],
    { env: { ...env, ...settings }, timeout: 10000 }).then(() => null, error => error);
    assert.ok(Number.isInteger(result?.code) && !result.killed, result?.message);
    assert.ok(tunnels > 0 && requests > 0, result?.stderr);
    assert.equal(authorization, 'Basic ' + Buffer.from('fixture-user:fixture-password').toString('base64'));
    assert.match(result.stderr, /404|not found/i);
  } finally {
    for (const socket of sockets) socket.destroy();
    origin.closeAllConnections();
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => origin.close(resolve))]);
  }
});
