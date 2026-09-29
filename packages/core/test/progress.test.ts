import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  progressFromDto,
  progressToDto,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
  type RunProgress,
} from '../src/index.js';

function make(): RunProgress {
  return {
    cleared: new Set(['b', 'a']),
    pin: 'a',
    tasks: new Map([
      ['t2', 'done'],
      ['t1', 'dont-care'],
    ]),
    tracked: new Map([
      ['z', false],
      ['c', true],
    ]),
  };
}

function snapshot(p: RunProgress): unknown {
  return { cleared: [...p.cleared], pin: p.pin, tasks: [...p.tasks], tracked: [...p.tracked] };
}

describe('progress setters', () => {
  it('emptyProgress is empty', () => {
    expect(snapshot(emptyProgress())).toEqual({ cleared: [], pin: null, tasks: [], tracked: [] });
  });

  it('clearing the pinned leaf removes the pin', () => {
    const p = setCleared(make(), 'a', true);
    expect(p.cleared.has('a')).toBe(true);
    expect(p.pin).toBeNull();
    expect(setCleared(make(), 'x', true).pin).toBe('a');
  });

  it('un-clearing removes the ID and keeps the pin', () => {
    const p = setCleared(make(), 'a', false);
    expect(p.cleared.has('a')).toBe(false);
    expect(p.pin).toBe('a');
  });

  it('setPin sets and clears', () => {
    expect(setPin(make(), 'b').pin).toBe('b');
    expect(setPin(make(), null).pin).toBeNull();
  });

  it('setTaskState replaces and deletes', () => {
    let p = setTaskState(emptyProgress(), 't', 'done');
    expect(p.tasks.get('t')).toBe('done');
    p = setTaskState(p, 't', 'dont-care');
    expect(p.tasks.get('t')).toBe('dont-care');
    p = setTaskState(p, 't', null);
    expect(p.tasks.has('t')).toBe(false);
  });

  it('setTracked sets and deletes the override', () => {
    let p = setTracked(emptyProgress(), 'c', false);
    expect(p.tracked.get('c')).toBe(false);
    p = setTracked(p, 'c', null);
    expect(p.tracked.has('c')).toBe(false);
  });

  it('never mutates its input', () => {
    const p = make();
    const before = snapshot(p);
    setCleared(p, 'a', true);
    setCleared(p, 'x', true);
    setCleared(p, 'a', false);
    setPin(p, 'q');
    setTaskState(p, 't1', null);
    setTaskState(p, 'n', 'done');
    setTracked(p, 'c', null);
    setTracked(p, 'n', true);
    expect(snapshot(p)).toEqual(before);
  });
});

describe('progress DTO', () => {
  it('sorts cleared and record keys', () => {
    const dto = progressToDto(make());
    expect(dto.cleared).toEqual(['a', 'b']);
    expect(Object.keys(dto.tasks)).toEqual(['t1', 't2']);
    expect(Object.keys(dto.tracked)).toEqual(['c', 'z']);
    expect(dto.pin).toBe('a');
  });

  it('round-trips', () => {
    const p = make();
    expect(progressFromDto(progressToDto(p))).toEqual(p);
  });
});
