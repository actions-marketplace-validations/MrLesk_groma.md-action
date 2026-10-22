import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function readPayload(html) {
  const json = html.match(/<script type="application\/json" id="world">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('Groma export does not contain its published world.');
  return JSON.parse(json);
}

export function summarize(payload) {
  if (!payload.comparison) throw new Error('Groma did not export a comparison.');
  const count = statuses => {
    const result = { added: 0, modified: 0, removed: 0 };
    for (const status of statuses) {
      if (status in result) result[status]++;
      else if (status !== 'unchanged') throw new Error(`Unknown Groma change status: ${status}`);
    }
    return result;
  };
  return {
    from: payload.comparison.from.id,
    revision: payload.revision.id,
    components: count(Object.values(payload.comparison.components).map(change => change.status)),
    relationships: count(Object.values(payload.comparison.relationships)),
  };
}

// The empty working root has no plugin configuration. Git still reads the existing
// repository's committed architecture and source, without loading project scanner hooks.
export async function exportComparison({ repositoryRoot, directory, from, revision, execute = run }) {
  const { stdout } = await run('git', ['rev-parse', '--absolute-git-dir'], { cwd: repositoryRoot });
  const root = await mkdtemp(path.join(os.tmpdir(), 'groma-comparison-'));
  try {
    await mkdir(path.join(root, 'groma'));
    await execute('groma', ['export', path.resolve(repositoryRoot, directory), '--from', from, '--revision', revision], {
      cwd: root,
      env: Object.fromEntries(Object.entries({ ...process.env, GIT_DIR: stdout.trim(), GIT_WORK_TREE: root })
        .filter(([key]) => key.toUpperCase() !== 'GIT_SSL_NO_VERIFY')),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const payload = readPayload(await readFile(path.join(directory, 'index.html'), 'utf8'));
  const summary = summarize(payload);
  const filename = path.join(directory, 'comparison.json');
  await writeFile(filename, JSON.stringify(summary, null, 2) + '\n');
  return filename;
}

if (process.argv[1] === import.meta.filename) {
  const summary = await exportComparison({
    repositoryRoot: process.cwd(),
    directory: process.env.GROMA_EXPORT,
    from: process.env.GROMA_FROM,
    revision: process.env.GROMA_REVISION,
  });
  await appendFile(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
}
