import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';

export interface ClosingTask {
  taskId: string;
  nextChance: string | null;
}
export interface ClearImpact {
  closing: ClosingTask[];
  lastChance: ClosingTask[];
  unlocks: string[];
  wasLocked: boolean;
}

export function clearImpact(guide: Guide, progress: RunProgress, leafId: string): ClearImpact {
  void guide;
  void progress;
  void leafId;
  throw new Error('not implemented yet (session A, Task 16)');
}
