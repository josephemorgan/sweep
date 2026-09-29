// The structure index: the shared structural backbone of the parser's graph and window phases and
// the engine. Built once per Guide object (memoized), in one iterative pass over the section tree.
import { END, type Guide, type Section, type Task, type TaskWindow } from '../model/guide.js';

/** A section's leaves as an inclusive index range into `GuideIndex.leaves`. */
export interface LeafRange {
  first: number;
  last: number;
}

export interface GuideIndex {
  /** Every section by ID, in route order (depth-first pre-order, groups included). */
  sections: Map<string, Section>;
  parent: Map<string, string | null>;
  /** Parent first, root last. */
  ancestors: Map<string, string[]>;
  /** Route order. */
  leaves: Section[];
  /** Leaf ID to its index in `leaves`. */
  pos: Map<string, number>;
  /** Every section (groups and leaves): its first and last leaf. */
  range: Map<string, LeafRange>;
  /** Every section: the IDs of its leaves, in route order. */
  leafIdsOf: Map<string, string[]>;
  tasks: Map<string, Task>;
  /** Exclusive group name to its task IDs, in file order. */
  exclusiveMembers: Map<string, string[]>;
}

const memo = new WeakMap<Guide, GuideIndex>();

/** True for a section without children: the only kind a user clears. */
export function isLeaf(section: Section): boolean {
  return section.children.length === 0;
}

/** Indexes `guide`. The result is cached per Guide object, so treat it as read-only. */
export function indexGuide(guide: Guide): GuideIndex {
  const cached = memo.get(guide);
  if (cached !== undefined) return cached;
  const index = build(guide);
  memo.set(guide, index);
  return index;
}

/**
 * The leaf range a window covers: from its `from` section's first leaf to its `until` section's
 * last leaf (`END`: the last leaf of the guide).
 */
export function windowRange(index: GuideIndex, w: TaskWindow): LeafRange {
  const first = index.range.get(w.from)!.first;
  const last = w.until === END ? index.leaves.length - 1 : index.range.get(w.until)!.last;
  return { first, last };
}

interface Frame {
  section: Section;
  next: number;
  firstLeaf: number;
}

function build(guide: Guide): GuideIndex {
  const index: GuideIndex = {
    sections: new Map(),
    parent: new Map(),
    ancestors: new Map(),
    leaves: [],
    pos: new Map(),
    range: new Map(),
    leafIdsOf: new Map(),
    tasks: new Map(),
    exclusiveMembers: new Map(),
  };
  // Iterative depth-first walk: enter a section on the way down, finish it (fill its range and
  // leaf IDs) once every child is done.
  const stack: Frame[] = [];
  const ancestorIds: string[] = [];
  const enter = (section: Section, parentId: string | null): void => {
    index.sections.set(section.id, section);
    index.parent.set(section.id, parentId);
    index.ancestors.set(section.id, [...ancestorIds].reverse());
    const firstLeaf = index.leaves.length;
    if (isLeaf(section)) {
      index.pos.set(section.id, firstLeaf);
      index.leaves.push(section);
    }
    stack.push({ section, next: 0, firstLeaf });
    ancestorIds.push(section.id);
  };
  const finish = (frame: Frame): void => {
    const { section, firstLeaf } = frame;
    const last = index.leaves.length - 1;
    index.range.set(section.id, { first: firstLeaf, last });
    index.leafIdsOf.set(
      section.id,
      index.leaves.slice(firstLeaf, last + 1).map((leaf) => leaf.id),
    );
    ancestorIds.pop();
  };
  for (const root of guide.sections) {
    enter(root, null);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const child = frame.section.children[frame.next];
      if (child === undefined) {
        finish(frame);
        stack.pop();
      } else {
        frame.next += 1;
        enter(child, frame.section.id);
      }
    }
  }
  for (const task of guide.tasks) {
    index.tasks.set(task.id, task);
    if (task.exclusive === null) continue;
    const members = index.exclusiveMembers.get(task.exclusive);
    if (members === undefined) index.exclusiveMembers.set(task.exclusive, [task.id]);
    else members.push(task.id);
  }
  return index;
}
