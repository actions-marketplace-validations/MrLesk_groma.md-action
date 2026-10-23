import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import trust from './trust-bootstrap.cjs';
export const { blockedSPKI, filterAuthorities, npmAuthorities, trustSettings, prepareTrust, prepareWorkflowTrust, exportSettings } = trust;

export function installArguments(packageName, bundle) {
  if (!/^groma\.md@[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(packageName) && packageName !== 'npm@12.2.1') {
    throw new Error('Choose an exact Groma version or npm distribution tag.');
  }
  return ['install', '--global', '--strict-ssl=true', `--cafile=${bundle}`, packageName];
}

export function runNpm(args, env, { query = trust.nativeNpm, execute = execFileSync, exists = existsSync } = {}) {
  const cli = trust.npmCLI({ env, query, exists });
  // npm retains its own authentication, proxy, registry and global config handling.
  execute(process.execPath, [cli, ...args], { env, stdio: 'inherit' });
}

export function installGroma(version, settings, { env = process.env, execute = runNpm } = {}) {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major < 26 || (major === 26 && (minor < 12 || (minor === 12 && patch < 1)))) {
    throw new Error('Groma installation requires patched Node 26.12.1 or newer.');
  }
  const cafile = settings.NPM_CONFIG_CAFILE;
  const args = installArguments(`groma.md@${version}`, cafile);
  const strict = { ...env, ...settings, NODE_OPTIONS: '--use-bundled-ca' };
  execute(installArguments('npm@12.2.1', cafile), strict);
  execute(args, strict);
}

/** Native Git belongs to the project; only npm and Node receive installation trust. */
export function prepareInstallationTrust() {
  const { node: settings } = prepareWorkflowTrust();
  const selected = npmAuthorities();
  const cafile = path.join(path.dirname(settings.NODE_EXTRA_CA_CERTS), 'npm-ca.pem');
  if (selected !== null) writeFileSync(cafile, filterAuthorities(selected), { mode: 0o600 });
  return { ...settings, NPM_CONFIG_CAFILE: selected === null ? settings.NODE_EXTRA_CA_CERTS : cafile,
    NPM_CONFIG_STRICT_SSL: 'true', npm_config_strict_ssl: 'true' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'install') {
    installGroma(process.env.GROMA_VERSION, prepareInstallationTrust());
    const launcher = path.join(trust.nativeNpm(['root', '--global']), 'groma.md', 'cli.cjs');
    exportSettings({ GROMA_CLI: launcher }, process.env.GITHUB_ENV);
  }
  else if (process.argv[2]) throw new Error('Usage: prepare-trust.mjs [install]');
  else exportSettings(prepareTrust(), process.env.GITHUB_ENV);
}
