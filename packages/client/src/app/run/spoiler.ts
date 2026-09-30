import type { GuideIndex, RunView, Section, SectionView, Task, TaskStatus } from '@sweep/core';
import type { Reveals } from './reveals';

export const HIDDEN_SECTION = 'a hidden section';
export const taskRevealKey = (id: string): string => `task:${id}`;
export const sectionRevealKey = (id: string): string => `section:${id}`;

/** Layer 2: a spoiler task's title and `how` are blurred until tapped or until it is done. */
export function taskBlurred(
  task: Pick<Task, 'spoiler'>,
  status: TaskStatus | undefined,
  revealed: boolean,
): boolean {
  return task.spoiler && status?.kind !== 'done' && !revealed;
}

/** Layer 2: a spoiler section's title and overview are blurred while it isn't reached. */
export function sectionBlurred(
  section: Pick<Section, 'spoiler'>,
  view: SectionView | undefined,
  revealed: boolean,
): boolean {
  return section.spoiler && view?.reached !== true && !revealed;
}

/** A section's title for plain text (toasts, "Requires: …", dialogs), or "a hidden section". */
export function sectionLabel(
  index: GuideIndex,
  view: RunView,
  reveals: Reveals,
  sectionId: string,
): string {
  const section = index.sections.get(sectionId);
  if (!section) return sectionId;
  const hidden = sectionBlurred(
    section,
    view.sections.get(sectionId),
    reveals.has(sectionRevealKey(sectionId)),
  );
  return hidden ? HIDDEN_SECTION : section.title;
}
