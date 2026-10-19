import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Finish plugin selection before the one scan whose result is exported. */
export async function scanAndExport({ configFile, directory, repositoryRoot = process.cwd(), execute = execFileSync }) {
  const options = { cwd: repositoryRoot, stdio: 'inherit' };
  await execute('groma', ['plugin', 'install'], options);
  const config = JSON.parse(await readFile(path.resolve(repositoryRoot, configFile), 'utf8'));
  for (const scanner of config.scanners) {
    if (/^(@[^/]+\/)?[^/@]+@[^/]+$/.test(scanner.source)) {
      await execute('groma', ['plugin', 'update', scanner.id], options);
    }
  }
  await execute('groma', ['scanner', 'check'], options);
  await execute('groma', ['scan'], options);
  await execute('groma', ['export', directory], options);
}

if (process.argv[1] === import.meta.filename) {
  await scanAndExport({ configFile: process.env.GROMA_CONFIG, directory: process.env.GROMA_EXPORT });
}
