import type { RunProgress } from '../model/progress.js';
import type { GuideDiff } from './diff-guides.js';

export function migrateProgress(progress: RunProgress, diff: GuideDiff): RunProgress {
  void progress;
  void diff;
  throw new Error('not implemented yet (session A, Task 19)');
}
