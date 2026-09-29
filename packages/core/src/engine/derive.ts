import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { RunView } from './cards.js';

export const SectionState = {
  Locked: 'locked',
  Available: 'available',
  Current: 'current',
  Cleared: 'cleared',
} as const;
export type SectionState = (typeof SectionState)[keyof typeof SectionState];

export const WindowStatus = { Upcoming: 'upcoming', Open: 'open', Closed: 'closed' } as const;
export type WindowStatus = (typeof WindowStatus)[keyof typeof WindowStatus];

export type TaskStatus =
  | { kind: 'done' }
  | { kind: 'dont-care' }
  | { kind: 'not-chosen' }
  | { kind: 'open'; window: number; secondChance: boolean }
  | { kind: 'upcoming' }
  | { kind: 'missed'; nextChance: string | null };
export type TaskStatusKind = TaskStatus['kind'];

export interface SectionView {
  state: SectionState;
  cleared: boolean;
  unlocked: boolean;
  reached: boolean;
}

export interface CoreView {
  current: string | null;
  /** `current` came from a valid pin. */
  pinned: boolean;
  sections: Map<string, SectionView>;
  /** Task ID to per-window status. */
  windows: Map<string, WindowStatus[]>;
  tasks: Map<string, TaskStatus>;
}

export function deriveCore(guide: Guide, progress: RunProgress): CoreView {
  void guide;
  void progress;
  throw new Error('not implemented yet (session A, Task 13)');
}

export function deriveRun(guide: Guide, progress: RunProgress): RunView {
  void guide;
  void progress;
  throw new Error('not implemented yet (session A, Task 15)');
}
