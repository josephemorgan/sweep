// A parse worker for tests (the `workerUrl` / `parseWorkerUrl` hook). It fails for real when the
// guide contains a marker from helpers/guides.ts (CRASH_THROW, CRASH_EXIT), and otherwise runs
// the real parse worker. Loaded by Node's own type stripping, so it imports no relative .js paths.
import { workerData } from 'node:worker_threads';

const { input } = workerData as { input: string | Uint8Array };
const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
if (text.includes('# crash-worker: throw\n')) throw new Error('crash-worker: thrown on purpose');
if (text.includes('# crash-worker: exit\n')) process.exit(3);
await import(new URL('../../src/guides/parse-worker.ts', import.meta.url).href);
