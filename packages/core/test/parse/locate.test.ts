import { describe, expect, it } from 'vitest';
import { LineCounter, parseDocument } from 'yaml';
import { createLocator, formatPath, type Locator } from '../../src/parse/locate.js';

describe('formatPath', () => {
  it.each([
    [[], ''],
    [['sweep'], 'sweep'],
    [['tasks', 3, 'windows', 0, 'home'], 'tasks[3].windows[0].home'],
    [['categories', 'loot', 'name'], 'categories.loot.name'],
  ] as const)('%j gives %j', (path, expected) => {
    expect(formatPath(path)).toBe(expected);
  });
});

const DOC = [
  'categories:', //                1
  '  loot:', //                    2
  '    name: Loot', //             3
  'sections:', //                  4
  '  - id: start', //              5
  '    title: Start', //           6
  '  - id: forest', //             7
  '    title: Forest', //          8
  '    requires: [start]', //      9
  '    notes: &n shared', //      10
  '    also: *n', //              11
  '    empty:', //                12
  '',
].join('\n');

function locator(text: string, lineOffset = 0): Locator {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { version: '1.2', schema: 'core', lineCounter });
  return createLocator(doc, lineCounter, lineOffset);
}

describe('createLocator', () => {
  const loc = locator(DOC);

  it('finds the value node of a path', () => {
    expect(loc.value(['sections', 1, 'title'])).toEqual({ line: 8, column: 12 });
    expect(loc.value(['sections', 1, 'requires', 0])).toEqual({ line: 9, column: 16 });
    expect(loc.value(['categories', 'loot'])).toEqual({ line: 3, column: 5 });
  });

  it('falls back to the deepest existing node for a missing segment', () => {
    expect(loc.value(['sections', 1, 'nope'])).toEqual({ line: 7, column: 5 });
    expect(loc.value(['sections', 9, 'title'])).toEqual({ line: 5, column: 3 });
    expect(loc.value(['sections', 'title'])).toEqual({ line: 5, column: 3 });
    expect(loc.value(['nope'])).toEqual({ line: 1, column: 1 });
    expect(loc.value([])).toEqual({ line: 1, column: 1 });
  });

  it('stops at an alias node instead of following it to its anchor', () => {
    expect(loc.value(['sections', 1, 'also'])).toEqual({ line: 11, column: 11 });
    expect(loc.value(['sections', 1, 'also', 'deeper'])).toEqual({ line: 11, column: 11 });
  });

  it('points at an empty value where it would be written', () => {
    expect(loc.value(['sections', 1, 'empty'])).toEqual({ line: 12, column: 11 });
  });

  it('finds the key node of the last segment', () => {
    expect(loc.key(['categories', 'loot'])).toEqual({ line: 2, column: 3 });
    expect(loc.key(['sections', 1, 'title'])).toEqual({ line: 8, column: 5 });
  });

  it('falls back like value() when the key is missing', () => {
    expect(loc.key(['categories', 'cards'])).toEqual({ line: 2, column: 3 });
    expect(loc.key(['sections', 0])).toEqual({ line: 5, column: 5 });
  });

  it('shifts lines by lineOffset and leaves columns alone', () => {
    const shifted = locator(DOC, 1);
    expect(shifted.value(['sections', 1, 'title'])).toEqual({ line: 9, column: 12 });
    expect(shifted.key(['categories', 'loot'])).toEqual({ line: 3, column: 3 });
  });

  it('gives 1:1 plus the offset for an empty document', () => {
    expect(locator('', 1).value(['sweep'])).toEqual({ line: 2, column: 1 });
  });
});
