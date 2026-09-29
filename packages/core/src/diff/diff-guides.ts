import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';

export interface Edited {
  id: string;
  fields: string[];
}
export interface Renamed {
  from: string;
  to: string;
  fields: string[];
}
export interface KindDiff {
  added: string[];
  removed: string[];
  edited: Edited[];
  renamed: Renamed[];
}

export const ProgressKind = {
  Cleared: 'cleared',
  Pin: 'pin',
  Task: 'task',
  Tracked: 'tracked',
} as const;
export type ProgressKind = (typeof ProgressKind)[keyof typeof ProgressKind];

export interface ProgressRef {
  kind: ProgressKind;
  id: string;
}
export interface ProgressMigration {
  kind: ProgressKind;
  from: string;
  to: string;
}
export interface ProgressDiff {
  migrated: ProgressMigration[];
  orphaned: ProgressRef[];
  restored: ProgressRef[];
}
export interface GuideDiff {
  sections: KindDiff;
  tasks: KindDiff;
  categories: KindDiff;
  likelyRegenerated: boolean;
  progress: ProgressDiff | null;
}

export function diffGuides(oldGuide: Guide, newGuide: Guide, progress?: RunProgress): GuideDiff {
  void oldGuide;
  void newGuide;
  void progress;
  throw new Error('not implemented yet (session A, Task 18)');
}
