import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const theme = process.env.GROMA_THEME;
if (!['auto', 'light', 'dark', 'blueprint'].includes(theme)) {
  throw new Error('Choose a theme: auto, light, dark, or blueprint.');
}
const from = process.env.GROMA_FROM ?? '';
const revision = process.env.GROMA_REVISION ?? '';
if (Boolean(from) !== Boolean(revision)) throw new Error('Supply both from and revision for a comparison.');
const patterns = (process.env.GROMA_EXCLUDE ?? '').split(/\r?\n/).filter(line => line.trim() !== '');
if (from && patterns.length) throw new Error('Comparison uses committed architecture; exclude only applies to scanning.');

const directories = ['groma', '.groma'].filter(directory => existsSync(directory));
if (directories.length > 1) throw new Error('Both groma/ and .groma/ exist; keep one Groma directory.');
const directory = directories[0];
if (!directory || !['index.md', 'project.md'].every(file => existsSync(path.join(directory, file)))) {
  throw new Error('Initialize Groma locally with groma init and commit its project files before using this Action.');
}

let scannerKey = '';
let configFile = '';
if (!from) {
  const filename = path.join(directory, 'config.json');
  configFile = filename;
  const config = JSON.parse(await readFile(filename, 'utf8'));
  if (patterns.length > 0) config.exclude = [...(config.exclude ?? []), ...patterns];
  // This working copy updates explicitly before scanning; no detached update may race its export.
  if (patterns.length > 0 || config.automaticUpdates !== false) {
    config.automaticUpdates = false;
    await writeFile(filename, JSON.stringify(config, null, 2) + '\n');
  }
  const sources = config.scanners.map(scanner => scanner.source).sort();
  scannerKey = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
}

const output = path.resolve(process.env.GROMA_OUTPUT);
const exportDirectory = path.join(output, 'architecture', theme);
await appendFile(process.env.GITHUB_OUTPUT,
  `output=${output}\nexport-directory=${exportDirectory}\nscanner-key=${scannerKey}\nconfig-file=${configFile}\n`);
