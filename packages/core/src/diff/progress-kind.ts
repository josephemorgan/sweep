export const ProgressKind = {
  Cleared: 'cleared',
  Pin: 'pin',
  Task: 'task',
  Tracked: 'tracked',
} as const;
export type ProgressKind = (typeof ProgressKind)[keyof typeof ProgressKind];
