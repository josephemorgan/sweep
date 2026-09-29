// Graph phase (plan phase 7): `requires-lineage`, then `requires-cycle` (skipped after any lineage
// error). Nodes are sections; an edge `x → y` means "x needs y".
import { indexGuide, type GuideIndex } from '../engine/structure.js';
import type { Guide, Requires, Section } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { ErrorCode } from './issue-codes.js';
import { issue } from './issues.js';
import type { Locator, PathSegment } from './locate.js';
import type { SourceMap } from './normalize.js';
import type { SourceText } from './text.js';

const requiredIds = (requires: Requires): string[] =>
  'all' in requires ? requires.all : requires.any;

/** The YAML path of entry `i` of a section's `requires` list. */
function entryPath(section: PathSegment[], requires: Requires, i: number): PathSegment[] {
  return 'all' in requires ? [...section, 'requires', i] : [...section, 'requires', 'any', i];
}

/**
 * Checks the requires graph (spec §3.6). A section may not require itself, an ancestor or a
 * descendant (`requires-lineage`); otherwise each strongly connected component of more than one
 * section is one `requires-cycle`. Any-of is checked conservatively, as if it were all-of.
 */
export function checkGraph(
  guide: Guide,
  sources: SourceMap,
  file: SourceText['file'],
  locator: Locator,
): Issue[] {
  const index = indexGuide(guide);
  const lineage = checkLineage(index, sources, file, locator);
  if (lineage.length > 0) return lineage;
  return checkCycles(index, sources, file, locator);
}

function checkLineage(
  index: GuideIndex,
  sources: SourceMap,
  file: SourceText['file'],
  locator: Locator,
): Issue[] {
  const issues: Issue[] = [];
  for (const section of index.sections.values()) {
    const path = sources.sections.get(section.id)!;
    requiredIds(section.requires).forEach((id, i) => {
      const problem = lineageProblem(index, section, id);
      if (problem === null) return;
      const at = entryPath(path, section.requires, i);
      const message = `section ${section.id} requires ${problem}`;
      issues.push(issue('error', ErrorCode.RequiresLineage, message, file, locator.value(at), at));
    });
  }
  return issues;
}

function lineageProblem(index: GuideIndex, section: Section, id: string): string | null {
  if (id === section.id) return 'itself';
  if (index.ancestors.get(section.id)!.includes(id)) return `its own group ${id}`;
  if (index.ancestors.get(id)!.includes(section.id)) return `${id}, which is inside it`;
  return null;
}

/** Adjacency lists over route-order positions: `edges[x]` are the sections x needs. */
function buildEdges(index: GuideIndex, order: Map<string, number>): number[][] {
  const edges: number[][] = [];
  for (const section of index.sections.values()) {
    const targets = new Set<number>();
    for (const id of requiredIds(section.requires)) targets.add(order.get(id)!);
    for (const child of section.children) targets.add(order.get(child.id)!);
    if (section.children.length === 0) {
      for (const ancestor of index.ancestors.get(section.id)!) {
        for (const id of requiredIds(index.sections.get(ancestor)!.requires)) {
          targets.add(order.get(id)!);
        }
      }
    }
    edges.push([...targets]);
  }
  return edges;
}

function checkCycles(
  index: GuideIndex,
  sources: SourceMap,
  file: SourceText['file'],
  locator: Locator,
): Issue[] {
  const sections = [...index.sections.values()];
  const order = new Map(sections.map((s, i) => [s.id, i]));
  const issues: Issue[] = [];
  for (const component of stronglyConnected(buildEdges(index, order))) {
    if (component.length < 2) continue;
    component.sort((a, b) => a - b);
    const members = component.map((i) => sections[i]!);
    const names = [...members, members[0]!].map((s) => s.id).join(' → ');
    const withRequires = members.find((s) => hasExplicitRequires(sources, locator, s));
    // A cycle always has an explicit requires, since default edges point backward; the fallback
    // only keeps a bug from throwing.
    const path = sources.sections.get((withRequires ?? members[0]!).id)!;
    const at = withRequires === undefined ? path : [...path, 'requires'];
    const message = `requires cycle: ${names}`;
    issues.push(issue('error', ErrorCode.RequiresCycle, message, file, locator.value(at), at));
  }
  return issues;
}

/**
 * Whether the file writes `requires` on this section. The locator falls back to the section's own
 * node when the key is absent, so a differing position means it's there.
 */
function hasExplicitRequires(sources: SourceMap, locator: Locator, section: Section): boolean {
  const path = sources.sections.get(section.id)!;
  const own = locator.value(path);
  const requires = locator.value([...path, 'requires']);
  return own.line !== requires.line || own.column !== requires.column;
}

/** Iterative Tarjan: strongly connected components of a graph given as adjacency lists. */
function stronglyConnected(edges: number[][]): number[][] {
  const n = edges.length;
  const indexOf = new Array<number>(n).fill(-1);
  const lowlink = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;
  const visit = (node: number): void => {
    indexOf[node] = lowlink[node] = counter++;
    stack.push(node);
    onStack[node] = true;
  };
  for (let root = 0; root < n; root += 1) {
    if (indexOf[root] !== -1) continue;
    const work: { node: number; edge: number }[] = [{ node: root, edge: 0 }];
    visit(root);
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const { node } = frame;
      const next = edges[node]![frame.edge];
      if (next !== undefined) {
        frame.edge += 1;
        if (indexOf[next] === -1) {
          visit(next);
          work.push({ node: next, edge: 0 });
        } else if (onStack[next]) {
          lowlink[node] = Math.min(lowlink[node]!, indexOf[next]!);
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) {
        lowlink[parent.node] = Math.min(lowlink[parent.node]!, lowlink[node]!);
      }
      if (lowlink[node] === indexOf[node]) {
        const component: number[] = [];
        let member: number;
        do {
          member = stack.pop()!;
          onStack[member] = false;
          component.push(member);
        } while (member !== node);
        components.push(component);
      }
    }
  }
  return components;
}
