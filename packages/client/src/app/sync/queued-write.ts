import type { TaskState } from '@sweep/core';

/** One optimistic write (see "Retry queue semantics" in the client plan). Absolute values only. */
export type QueuedWrite =
  | { kind: 'section'; runId: string; sectionId: string; cleared: boolean }
  | { kind: 'pin'; runId: string; sectionId: string | null }
  | { kind: 'task'; runId: string; taskId: string; state: TaskState | null }
  | { kind: 'category'; runId: string; categoryId: string; tracked: boolean | null }
  | { kind: 'run-name'; runId: string; name: string };

/** Writes with the same key overwrite each other; replaying a write is idempotent. */
export function writeKey(w: QueuedWrite): string {
  switch (w.kind) {
    case 'section':
      return `section:${w.runId}:${w.sectionId}`;
    case 'pin':
      return `pin:${w.runId}`;
    case 'task':
      return `task:${w.runId}:${w.taskId}`;
    case 'category':
      return `category:${w.runId}:${w.categoryId}`;
    case 'run-name':
      return `run-name:${w.runId}`;
  }
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Guards writes read back from storage. */
export function isQueuedWrite(value: unknown): value is QueuedWrite {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  if (!isId(w['runId'])) return false;
  switch (w['kind']) {
    case 'section':
      return isId(w['sectionId']) && typeof w['cleared'] === 'boolean';
    case 'pin':
      return w['sectionId'] === null || isId(w['sectionId']);
    case 'task':
      return (
        isId(w['taskId']) &&
        (w['state'] === null || w['state'] === 'done' || w['state'] === 'dont-care')
      );
    case 'category':
      return isId(w['categoryId']) && (w['tracked'] === null || typeof w['tracked'] === 'boolean');
    case 'run-name':
      return typeof w['name'] === 'string';
    default:
      return false;
  }
}
