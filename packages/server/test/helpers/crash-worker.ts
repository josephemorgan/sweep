// A parse worker for tests (the `workerUrl` / `parseWorkerUrl` hook). It fails for real when the
// guide contains a marker from helpers/guides.ts (CRASH_THROW, CRASH_EXIT, CRASH_OOM), and
// otherwise runs the real parse worker. Loaded by Node's own type stripping, so it imports no
// relative .js paths.
import { workerData } from 'node:worker_threads';

const { input } = workerData as { input: string | Uint8Array };
const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
if (text.includes('# crash-worker: throw\n')) throw new Error('crash-worker: thrown on purpose');
if (text.includes('# crash-worker: exit\n')) process.exit(3);
if (text.includes('# crash-worker: oom\n')) {
  // Grows the heap until the worker's resourceLimits stop it.
  const hog: number[][] = [];
  for (;;) hog.push(new Array<number>(1_000_000).fill(hog.length));
}
await import(new URL('../../src/guides/parse-worker.ts', import.meta.url).href);
