/** One step of a YAML path: a mapping key or a sequence index. */
export type PathSegment = string | number;

/** Formats a YAML path, e.g. `['tasks', 3, 'windows', 0, 'home']` gives `tasks[3].windows[0].home`. */
export function formatPath(path: readonly PathSegment[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? segment : `.${segment}`;
  }
  return out;
}
