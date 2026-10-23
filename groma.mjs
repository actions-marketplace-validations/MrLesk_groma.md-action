import { spawn } from 'node:child_process';

/** Start the npm launcher directly and stream scanner output without a buffer limit. */
export function runGroma(args, options = {}) {
  const launcher = (options.env ?? process.env).GROMA_CLI;
  if (!launcher) throw new Error('Install Groma before running the Action.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`Groma exited with ${signal ?? code}.`), { code, signal }));
    });
  });
}
