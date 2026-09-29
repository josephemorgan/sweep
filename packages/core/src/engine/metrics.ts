import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { RunView } from './cards.js';

export interface Metrics {
  here: number;
  now: number;
  closing: number;
  lastChance: number;
}

export function deriveMetrics(
  guide: Guide,
  progress: RunProgress,
  run: RunView,
  category?: string | null,
): Metrics {
  void guide;
  void progress;
  void run;
  void category;
  throw new Error('not implemented yet (session A, Task 16)');
}
