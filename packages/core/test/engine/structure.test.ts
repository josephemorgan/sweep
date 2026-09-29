import { describe, expect, it } from 'vitest';
import { indexGuide, isLeaf, windowRange } from '../../src/engine/structure.js';
import { indexGuide as exported } from '../../src/index.js';
import { loadGuide } from '../helpers.js';

describe('indexGuide on lantern-keep', () => {
  const guide = loadGuide('lantern-keep');
  const index = indexGuide(guide);

  it('lists leaves in route order', () => {
    expect(index.leaves.map((s) => s.id)).toEqual([
      'village',
      'marsh',
      'keep-gate',
      'east-tower',
      'west-tower',
      'throne-room',
      'epilogue',
    ]);
  });

  it('gives each leaf its route position', () => {
    expect(index.pos.get('east-tower')).toBe(3);
    expect(index.pos.get('act-2')).toBeUndefined();
  });

  it('gives every section (groups and leaves) a leaf range', () => {
    expect(index.range.get('act-2')).toEqual({ first: 2, last: 5 });
    expect(index.range.get('epilogue')).toEqual({ first: 6, last: 6 });
    expect(index.range.size).toBe(index.sections.size);
  });

  it('records parents and ancestors, nearest first', () => {
    expect(index.parent.get('west-tower')).toBe('act-2');
    expect(index.parent.get('act-1')).toBeNull();
    expect(index.ancestors.get('west-tower')).toEqual(['act-2']);
    expect(index.ancestors.get('act-1')).toEqual([]);
  });

  it('lists the leaf IDs under every section', () => {
    expect(index.leafIdsOf.get('act-1')).toEqual(['village', 'marsh']);
    expect(index.leafIdsOf.get('epilogue')).toEqual(['epilogue']);
  });

  it('indexes sections, tasks and exclusive groups', () => {
    expect(index.sections.get('marsh')?.id).toBe('marsh');
    expect(index.tasks.get('sunblade')?.id).toBe('sunblade');
    expect(index.exclusiveMembers.get('armory-reward')).toEqual(['sunblade', 'moonshield']);
  });

  it('maps a window to its leaf range, END to the last leaf', () => {
    const history = index.tasks.get('keep-history')!;
    expect(windowRange(index, history.windows[0]!)).toEqual({ first: 2, last: 6 });
    const chest = index.tasks.get('village-chest')!;
    expect(windowRange(index, chest.windows[0]!)).toEqual({ first: 0, last: 1 });
  });

  it('is memoized per Guide object and exported from the main entry', () => {
    expect(indexGuide(guide)).toBe(indexGuide(guide));
    expect(exported).toBe(indexGuide);
  });

  it('tells leaves from groups', () => {
    expect(isLeaf(index.sections.get('act-1')!)).toBe(false);
    expect(isLeaf(index.sections.get('village')!)).toBe(true);
  });
});
