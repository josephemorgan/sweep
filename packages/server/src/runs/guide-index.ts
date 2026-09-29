// src/runs/guide-index.ts
import type { Guide, Section } from '@sweep/core';

/** ID sets of the current guide version, used for the §6.2 "right kind" check (422). */
export interface GuideIndex {
  leaves: Set<string>;
  groups: Set<string>;
  tasks: Set<string>;
  categories: Set<string>;
}

export function indexGuide(guide: Guide): GuideIndex {
  const leaves = new Set<string>();
  const groups = new Set<string>();
  const walk = (sections: Section[]): void => {
    for (const section of sections) {
      if (section.children.length === 0) {
        leaves.add(section.id);
      } else {
        groups.add(section.id);
        walk(section.children);
      }
    }
  };
  walk(guide.sections);
  return {
    leaves,
    groups,
    tasks: new Set(guide.tasks.map((t) => t.id)),
    categories: new Set(guide.categories.map((c) => c.id)),
  };
}
