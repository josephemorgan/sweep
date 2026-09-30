/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Spec-only helper: reads a file under `packages/client/src` (tests run with cwd = the client package). */
export function readClientSource(rel: string): string {
  if (!existsSync(resolve(process.cwd(), 'angular.json'))) {
    throw new Error(
      `readClientSource: angular.json not found in ${process.cwd()}; run the client tests from packages/client`,
    );
  }
  return readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');
}
