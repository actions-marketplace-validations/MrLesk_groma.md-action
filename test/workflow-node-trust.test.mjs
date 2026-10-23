import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { prepareWorkflowTrust } from '../prepare-trust.mjs';

const fixture = new URL('./fixtures/certificate-trust/', import.meta.url);
const request = `require('node:https').get(process.argv[1], response => {
  response.resume(); response.on('end', () => console.log(response.statusCode));
}).on('error', error => { console.error(error.code); process.exitCode = 1; });`;

async function checkNodeTrust(t, mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'groma-node-trust-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const privateCA = await readFile(new URL('registry-ca.pem', fixture), 'utf8');
  const incidents = JSON.parse(await readFile(new URL('compromised-cas.json', fixture))).certificates;
  const original = path.join(root, 'original.pem'), originalDirectory = path.join(root, 'original-directory');
  await mkdir(originalDirectory);
  await writeFile(original, [privateCA, ...incidents.map(certificate => certificate.pem)].join('\n'));
  const inherited = { ...process.env, SSL_CERT_FILE: original, SSL_CERT_DIR: originalDirectory };
  delete inherited.NODE_EXTRA_CA_CERTS;
  const settings = prepareWorkflowTrust({ env: inherited, directory: root, bundled: [privateCA], getCertificates: () => [] });
  const scoped = mode === 'setup' ? { ...settings.openssl, NODE_OPTIONS: '--use-openssl-ca' }
    : { NODE_OPTIONS: '--use-bundled-ca' };
  const env = { ...inherited, ...settings.node, ...scoped };
  assert.equal(Object.hasOwn(settings.node, 'SSL_CERT_FILE'), false);
  assert.equal(Object.hasOwn(settings.node, 'SSL_CERT_DIR'), false);
  assert.equal(inherited.SSL_CERT_FILE, original);
  assert.equal(inherited.SSL_CERT_DIR, originalDirectory);
  for (const filename of ['registry-server.pem', 'incident-server-aaa.pem']) {
    let requests = 0;
    const server = https.createServer({ key: await readFile(new URL('registry-server-key.pem', fixture)),
      cert: await readFile(new URL(filename, fixture)) }, (_, response) => { requests++; response.end('ok'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = promisify(execFile)(process.execPath, ['-e', request, `https://localhost:${server.address().port}`], { env });
      if (filename === 'registry-server.pem') {
        assert.equal((await response).stdout.trim(), '200');
        assert.equal(requests, 1);
      } else {
        await assert.rejects(response, /CERT_|certificate|issuer/i);
        assert.equal(requests, 0);
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

it('setup Node downloads use filtered OpenSSL trust without exporting it to project commands',
  t => checkNodeTrust(t, 'setup'));
it('pinned Node scripts ignore inherited OpenSSL trust and retain filtered private roots',
  t => checkNodeTrust(t, 'scripts'));
