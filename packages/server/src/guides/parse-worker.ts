// Worker thread entry for guide parsing (spec §6.4). core-adapter.ts spawns one per parse with a
// ParseJob as workerData, and this posts back one ParseResult. With core-adapter.ts, the only
// src file that imports @sweep/core/parse.
//
// No relative imports: under Vitest and `tsx`, this file runs as TypeScript through Node's own
// type stripping, which doesn't map `./x.js` to `./x.ts`. Type-only imports must say `type`.
import { parentPort, workerData } from 'node:worker_threads';
import { parseGuide, type ParseResult } from '@sweep/core/parse';

export interface ParseJob {
  /** Virtual root file name: guide.yaml, guide.yml or guide.md. */
  fileName: string;
  /** The uploaded bytes (core checks UTF-8 and size), or a stored source being re-parsed. */
  input: Uint8Array | string;
}

/** Parses one job. Core does every check: UTF-8, size, structure and storability (`encoding`). */
function runParseJob({ fileName, input }: ParseJob): ParseResult {
  return parseGuide({ [fileName]: input });
}

// Spawned as a worker: parse the job and reply once. The thread then exits on its own.
if (parentPort) parentPort.postMessage(runParseJob(workerData as ParseJob));
