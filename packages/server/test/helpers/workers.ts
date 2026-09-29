import type { Worker } from 'node:worker_threads';

export interface WatchedWorker {
  worker: Worker;
  /** Resolves with the exit code once the thread has stopped. */
  exited: Promise<number>;
}

/**
 * Resolves when the next worker thread in this process starts (the process `worker` event fires
 * synchronously in the Worker constructor, so its exit can't be missed). A parse holds the
 * user's slot before it spawns its worker, so this is a latch for "the parse is running".
 */
export function nextWorker(): Promise<WatchedWorker> {
  return new Promise((resolve) => {
    process.once('worker', (worker) => {
      const exited = new Promise<number>((done) => worker.once('exit', done));
      resolve({ worker, exited });
    });
  });
}

/** The crash-worker test hook (see crash-worker.ts). */
export const CRASH_WORKER_URL = new URL('./crash-worker.ts', import.meta.url);
