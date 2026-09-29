import type { Guide, Section, Task, TaskWindow } from '@sweep/core';

export const TINY_YAML = `sweep: 1
game: Test Game
title: Tiny guide
categories:
  loot:
    name: Loot
    about: Things to pick up.
  lore:
    name: Lore
    about: Books. Off by default.
    tracked: false
sections:
  - id: act-1
    title: Act 1
    overview: The first act.
    sections:
      - id: village
        title: Village
        overview: Start here.
      - id: marsh
        title: Marsh
        overview: Cross it.
  - id: keep
    title: Keep
    overview: The end.
tasks:
  - id: chest
    title: Chest
    category: loot
    windows:
      - from: village
        until: marsh
  - id: herbs
    title: Herbs
    category: loot
    windows:
      - from: marsh
        until: end
  - id: book
    title: Book
    category: lore
    windows:
      - from: village
        until: end
`;

function leaf(id: string, title: string, overview: string, requires: string[]): Section {
  return {
    id,
    title,
    overview,
    walkthrough: null,
    requires: { all: requires },
    spoiler: false,
    renamedFrom: [],
    children: [],
  };
}

function task(id: string, title: string, category: string, windows: TaskWindow[]): Task {
  return {
    id,
    title,
    category,
    how: null,
    windows,
    exclusive: null,
    spoiler: false,
    renamedFrom: [],
  };
}

/** What parseGuide should produce for TINY_YAML (defaults resolved, spec §3.3). Task 13 checks it. */
export const TINY_GUIDE: Guide = {
  formatVersion: 1,
  game: 'Test Game',
  title: 'Tiny guide',
  categories: [
    { id: 'loot', name: 'Loot', about: 'Things to pick up.', tracked: true },
    { id: 'lore', name: 'Lore', about: 'Books. Off by default.', tracked: false },
  ],
  sections: [
    {
      id: 'act-1',
      title: 'Act 1',
      overview: 'The first act.',
      walkthrough: null,
      requires: { all: [] },
      spoiler: false,
      renamedFrom: [],
      children: [
        leaf('village', 'Village', 'Start here.', []),
        leaf('marsh', 'Marsh', 'Cross it.', ['village']),
      ],
    },
    leaf('keep', 'Keep', 'The end.', ['marsh']),
  ],
  tasks: [
    task('chest', 'Chest', 'loot', [{ from: 'village', until: 'marsh', home: 'village' }]),
    task('herbs', 'Herbs', 'loot', [{ from: 'marsh', until: 'end', home: 'marsh' }]),
    task('book', 'Book', 'lore', [{ from: 'village', until: 'end', home: 'village' }]),
  ],
};

/** Applies exact substring edits, failing loudly if a fixture drifts. */
function edit(source: string, edits: Array<[string, string]>): string {
  return edits.reduce((text, [from, to]) => {
    if (!text.includes(from)) throw new Error(`fixture edit: ${JSON.stringify(from)} not found`);
    return text.replace(from, to);
  }, source);
}

/** Same guide in the Markdown container, with a walkthrough for `village`. */
export const TINY_MD = `---\n${TINY_YAML}---\n# village\n\nTalk to the elder.\n`;

/** marsh → swamp, keep → castle, herbs → swamp-herbs, each with renamed_from. */
export const TINY_RENAMED_YAML = edit(TINY_YAML, [
  ['      - id: marsh\n', '      - id: swamp\n        renamed_from: marsh\n'],
  ['  - id: keep\n', '  - id: castle\n    renamed_from: keep\n'],
  ['        until: marsh\n', '        until: swamp\n'],
  ['  - id: herbs\n', '  - id: swamp-herbs\n    renamed_from: herbs\n'],
  ['      - from: marsh\n', '      - from: swamp\n'],
]);

/** The leaf `keep` becomes a group with two leaves. */
export const TINY_GROUPED_YAML = edit(TINY_YAML, [
  [
    '  - id: keep\n    title: Keep\n    overview: The end.\n',
    '  - id: keep\n    title: Keep\n    overview: The end.\n    sections:\n' +
      '      - id: keep-gate\n        title: Keep gate\n        overview: Open the gate.\n' +
      '      - id: throne\n        title: Throne room\n        overview: Face the keeper.\n',
  ],
]);

/** Error: a task names an undefined category. */
export const TINY_INVALID_YAML = edit(TINY_YAML, [['category: lore', 'category: nope']]);

/** Warning only: a category no task uses. */
export const TINY_WARNING_YAML = edit(TINY_YAML, [
  ['categories:\n', 'categories:\n  spare:\n    name: Spare\n    about: Nobody uses this.\n'],
]);

/**
 * TINY_MD with its walkthrough replaced by a list nested `depth` levels deep: size-legal (about
 * 17 kB at the default depth) but slow to parse, because the Markdown parser is superlinear on
 * nesting (measured: 4,000 levels ≈ 3.4 s, 6,000 ≈ 8 s, so 8,000 takes well over 10 s).
 */
export function deeplyNestedMd(depth = 8_000): string {
  return edit(TINY_MD, [['Talk to the elder.', `${'- '.repeat(depth)}x`]]);
}

/** YAML comment lines that make helpers/crash-worker.ts fail (it matches the same text). */
export const CRASH_THROW = '# crash-worker: throw\n';
export const CRASH_EXIT = '# crash-worker: exit\n';
export const CRASH_OOM = '# crash-worker: oom\n';
