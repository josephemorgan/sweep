import type { Guide, Requires } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { RunView } from './cards.js';
import { indexGuide, isLeaf, type LeafRange } from './structure.js';

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
  const index = indexGuide(guide);
  const { leaves, sections, range } = index;

  // Pass 1: which leaves are cleared. Stored IDs that are not leaves (unknown, or a group) drop out.
  // `clearedPrefix[i]` counts the cleared leaves before leaf `i`, so any section's leaf range
  // answers "how many cleared" in O(1).
  const clearedLeaf = leaves.map((leaf) => progress.cleared.has(leaf.id));
  const clearedPrefix = prefixSums(clearedLeaf);
  const isCleared = (id: string): boolean => {
    const r = range.get(id);
    if (r === undefined) return false; // unknown ID
    return countIn(clearedPrefix, r) === r.last - r.first + 1;
  };

  // Pass 2, in route order (parents before children): each section's gate, and whether the whole
  // gate chain from the root down to it is open.
  const chainOpen = new Map<string, boolean>();
  for (const [id, section] of sections) {
    const parentId = index.parent.get(id) ?? null;
    const parentOpen = parentId === null || chainOpen.get(parentId) === true;
    chainOpen.set(id, parentOpen && gateOpen(section.requires, isCleared));
  }

  const unlockedLeaf = leaves.map((leaf) => chainOpen.get(leaf.id) === true);
  const reachedLeaf = leaves.map((_, i) => unlockedLeaf[i]! || clearedLeaf[i]!);
  const unlockedPrefix = prefixSums(unlockedLeaf);
  const reachedPrefix = prefixSums(reachedLeaf);

  // current: a valid pin, otherwise the earliest unlocked, uncleared leaf.
  const pinPos = progress.pin === null ? undefined : index.pos.get(progress.pin);
  const pinned = pinPos !== undefined && !clearedLeaf[pinPos];
  let currentPos = pinned ? pinPos : -1;
  if (currentPos === -1) {
    currentPos = leaves.findIndex((_, i) => unlockedLeaf[i]! && !clearedLeaf[i]);
  }
  const current = currentPos === -1 ? null : leaves[currentPos]!.id;

  const views = new Map<string, SectionView>();
  for (const [id, section] of sections) {
    const r = range.get(id)!;
    const cleared = countIn(clearedPrefix, r) === r.last - r.first + 1;
    const unlocked = countIn(unlockedPrefix, r) > 0;
    const reached = countIn(reachedPrefix, r) > 0;
    const hasCurrent = currentPos !== -1 && currentPos >= r.first && currentPos <= r.last;
    let state: SectionState;
    if (cleared) state = SectionState.Cleared;
    else if (hasCurrent) state = SectionState.Current;
    else if (isLeaf(section) ? !unlocked : !reached) state = SectionState.Locked;
    else state = SectionState.Available;
    views.set(id, { state, cleared, unlocked, reached });
  }

  return { current, pinned, sections: views, windows: new Map(), tasks: new Map() };
}

function gateOpen(requires: Requires, isCleared: (id: string) => boolean): boolean {
  return 'all' in requires ? requires.all.every(isCleared) : requires.any.some(isCleared);
}

/** `out[i]` is how many of `flags[0..i)` are true. */
function prefixSums(flags: readonly boolean[]): number[] {
  const out = new Array<number>(flags.length + 1);
  out[0] = 0;
  for (let i = 0; i < flags.length; i += 1) out[i + 1] = out[i]! + (flags[i]! ? 1 : 0);
  return out;
}

function countIn(prefix: readonly number[], r: LeafRange): number {
  return prefix[r.last + 1]! - prefix[r.first]!;
}

export function deriveRun(guide: Guide, progress: RunProgress): RunView {
  void guide;
  void progress;
  throw new Error('not implemented yet (session A, Task 15)');
}
