import type { GuideIndex, RunView } from '@sweep/core';

export interface LockReason {
  mode: 'all' | 'any';
  ids: string[];
}

/** Why a leaf is locked (§4.4): the first unmet gate from the outermost ancestor down to the leaf. */
export function lockReason(index: GuideIndex, view: RunView, leafId: string): LockReason | null {
  const chain = [...(index.ancestors.get(leafId) ?? [])].reverse().concat(leafId);
  const cleared = (id: string): boolean => view.sections.get(id)?.cleared === true;
  for (const id of chain) {
    const requires = index.sections.get(id)!.requires;
    if ('all' in requires) {
      const unmet = requires.all.filter((r) => !cleared(r));
      if (unmet.length > 0) return { mode: 'all', ids: unmet };
    } else if (!requires.any.some(cleared)) {
      return { mode: 'any', ids: [...requires.any] };
    }
  }
  return null;
}
