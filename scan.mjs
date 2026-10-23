import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runGroma } from './groma.mjs';

/** Finish plugin selection before the one scan whose result is exported. */
export async function scanAndExport({ configFile, directory, repositoryRoot = process.cwd(), execute = runGroma }) {
  const options = { cwd: repositoryRoot, stdio: 'inherit' };
  await execute(['plugin', 'install'], options);
  const config = JSON.parse(await readFile(path.resolve(repositoryRoot, configFile), 'utf8'));
  for (const scanner of config.scanners) {
    if (/^(@[^/]+\/)?[^/@]+@[^/]+$/.test(scanner.source)) {
      await execute(['plugin', 'update', scanner.id], options);
    }
  }
  await execute(['scanner', 'check'], options);
  await execute(['scan'], options);
  await execute(['export', directory], options);
}

if (process.argv[1] === import.meta.filename) {
  await scanAndExport({ configFile: process.env.GROMA_CONFIG, directory: process.env.GROMA_EXPORT });
}
