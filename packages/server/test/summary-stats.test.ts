import { emptyProgress, setCleared, setTaskState, setTracked } from '@sweep/core';
import { parseGuide } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';
import { indexGuide } from '../src/runs/guide-index.js';
import { runSummaryStats } from '../src/runs/summary-stats.js';
import {
  TINY_GROUPED_YAML,
  TINY_GUIDE,
  TINY_INVALID_YAML,
  TINY_MD,
  TINY_RENAMED_YAML,
  TINY_WARNING_YAML,
  TINY_YAML,
} from './helpers/guides.js';

describe('fixtures', () => {
  it('TINY_GUIDE is what parseGuide produces for TINY_YAML', () => {
    expect(parseGuide({ 'guide.yaml': TINY_YAML }).guide).toEqual(TINY_GUIDE);
  });

  it.each([
    ['TINY_RENAMED_YAML', TINY_RENAMED_YAML],
    ['TINY_GROUPED_YAML', TINY_GROUPED_YAML],
    ['TINY_WARNING_YAML', TINY_WARNING_YAML],
  ])('%s parses without errors', (_name, yaml) => {
    expect(parseGuide({ 'guide.yaml': yaml }).guide).toBeDefined();
  });

  it('TINY_MD parses and TINY_INVALID_YAML does not', () => {
    expect(parseGuide({ 'guide.md': TINY_MD }).guide).toBeDefined();
    const invalid = parseGuide({ 'guide.yaml': TINY_INVALID_YAML });
    expect(invalid.guide).toBeUndefined();
    expect(invalid.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('indexGuide', () => {
  it('splits sections into leaves and groups and lists task and category IDs', () => {
    const index = indexGuide(TINY_GUIDE);
    expect([...index.leaves]).toEqual(['village', 'marsh', 'keep']);
    expect([...index.groups]).toEqual(['act-1']);
    expect([...index.tasks]).toEqual(['chest', 'herbs', 'book']);
    expect([...index.categories]).toEqual(['loot', 'lore']);
  });
});

describe('runSummaryStats', () => {
  it('counts leaves and tracked tasks for a fresh run', () => {
    expect(runSummaryStats(TINY_GUIDE, emptyProgress())).toEqual({
      leavesCleared: 0,
      leavesTotal: 3,
      tasksDone: 0,
      tasksTotal: 2,
    });
  });

  it('counts only cleared IDs that are leaves in the current guide', () => {
    let p = emptyProgress();
    for (const id of ['village', 'act-1', 'ghost']) p = setCleared(p, id, true);
    expect(runSummaryStats(TINY_GUIDE, p).leavesCleared).toBe(1);
  });

  it('applies category overrides to the task total', () => {
    const lore = setTracked(emptyProgress(), 'lore', true);
    expect(runSummaryStats(TINY_GUIDE, lore).tasksTotal).toBe(3);
    const noLoot = setTracked(emptyProgress(), 'loot', false);
    expect(runSummaryStats(TINY_GUIDE, noLoot).tasksTotal).toBe(0);
  });

  it('counts done tasks in tracked categories only, and leaves dont-care out of the total', () => {
    let p = emptyProgress();
    p = setTaskState(p, 'chest', 'done');
    p = setTaskState(p, 'herbs', 'dont-care');
    p = setTaskState(p, 'book', 'done'); // lore is untracked by default
    p = setTaskState(p, 'ghost', 'done');
    expect(runSummaryStats(TINY_GUIDE, p)).toMatchObject({ tasksDone: 1, tasksTotal: 1 });
  });
});
