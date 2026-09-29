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
