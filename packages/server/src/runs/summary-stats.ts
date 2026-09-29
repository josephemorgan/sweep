import { deriveRun } from '@sweep/core';
import type { Guide, RunProgress, RunSummary } from '@sweep/core';

/**
 * Runs-list stats (spec §4.8, §6.2). Delegates to the engine so the server and the client
 * agree on what counts: leaves cleared/total, and done/total over tracked-category tasks.
 */
export function runSummaryStats(guide: Guide, progress: RunProgress): RunSummary {
  return deriveRun(guide, progress).summary;
}
