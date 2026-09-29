import type { GuideSummaryDto } from '../model/api.js';
import type { Guide, Section } from '../model/guide.js';

function count(sections: Section[]): { sections: number; leaves: number } {
  let total = 0;
  let leaves = 0;
  for (const s of sections) {
    total += 1;
    if (s.children.length === 0) {
      leaves += 1;
    } else {
      const inner = count(s.children);
      total += inner.sections;
      leaves += inner.leaves;
    }
  }
  return { sections: total, leaves };
}

export function guideSummary(guide: Guide): GuideSummaryDto {
  const { sections, leaves } = count(guide.sections);
  return {
    game: guide.game,
    title: guide.title,
    sections,
    leaves,
    tasks: guide.tasks.length,
    categories: guide.categories.length,
  };
}
