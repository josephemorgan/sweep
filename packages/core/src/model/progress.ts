import type { ProgressDto } from './api.js';

export type TaskState = 'done' | 'dont-care';

/** Stored per-run progress (spec §4.2). Everything else is derived. */
export interface RunProgress {
  /** Leaf IDs. */
  cleared: Set<string>;
  /** Leaf ID. */
  pin: string | null;
  /** Absent = no user state. */
  tasks: Map<string, TaskState>;
  /** Category overrides; absent = guide default. */
  tracked: Map<string, boolean>;
}

export function emptyProgress(): RunProgress {
  return { cleared: new Set(), pin: null, tasks: new Map(), tracked: new Map() };
}

function copy(p: RunProgress): RunProgress {
  return {
    cleared: new Set(p.cleared),
    pin: p.pin,
    tasks: new Map(p.tasks),
    tracked: new Map(p.tracked),
  };
}

/** Clears or un-clears a leaf. Clearing the pinned leaf removes the pin. Never mutates `p`. */
export function setCleared(p: RunProgress, leafId: string, cleared: boolean): RunProgress {
  const next = copy(p);
  if (cleared) {
    next.cleared.add(leafId);
    if (next.pin === leafId) next.pin = null;
  } else {
    next.cleared.delete(leafId);
  }
  return next;
}

export function setPin(p: RunProgress, leafId: string | null): RunProgress {
  return { ...copy(p), pin: leafId };
}

/** `null` removes the task's user state. */
export function setTaskState(p: RunProgress, taskId: string, state: TaskState | null): RunProgress {
  const next = copy(p);
  if (state === null) next.tasks.delete(taskId);
  else next.tasks.set(taskId, state);
  return next;
}

/** `null` removes the category override (back to the guide default). */
export function setTracked(
  p: RunProgress,
  categoryId: string,
  tracked: boolean | null,
): RunProgress {
  const next = copy(p);
  if (tracked === null) next.tracked.delete(categoryId);
  else next.tracked.set(categoryId, tracked);
  return next;
}

export function progressFromDto(dto: ProgressDto): RunProgress {
  return {
    cleared: new Set(dto.cleared),
    pin: dto.pin,
    tasks: new Map(Object.entries(dto.tasks)),
    tracked: new Map(Object.entries(dto.tracked)),
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedRecord<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries([...map].sort(([a], [b]) => compare(a, b)));
}

/** Arrays and record keys are sorted, so the output is stable. */
export function progressToDto(p: RunProgress): ProgressDto {
  return {
    cleared: [...p.cleared].sort(compare),
    pin: p.pin,
    tasks: sortedRecord(p.tasks),
    tracked: sortedRecord(p.tracked),
  };
}
