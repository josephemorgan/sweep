/** Normalized guide model (spec §4.1). Defaults are always resolved. */
export interface Guide {
  formatVersion: 1;
  game: string;
  title: string;
  /** In file order. */
  categories: Category[];
  /** Tree in route order. */
  sections: Section[];
  /** In file order. */
  tasks: Task[];
}

export interface Category {
  id: string;
  name: string;
  about: string;
  tracked: boolean;
}

export type Requires = { all: string[] } | { any: string[] };

export interface Section {
  id: string;
  title: string;
  overview: string;
  walkthrough: string | null;
  /** Defaults resolved (spec §3.3 "requires forms"). */
  requires: Requires;
  spoiler: boolean;
  renamedFrom: string[];
  /** `[]` for a leaf. */
  children: Section[];
}

/** The `until` value of a window that never closes. Reserved: no section or task may use it as an ID. */
export const END = 'end' as const;

/** One availability range of a task (spec §4.1). */
export interface TaskWindow {
  from: string;
  /** A section ID, or `END` (`'end'`): the window never closes. */
  until: string;
  home: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  how: string | null;
  /** Defaults resolved. */
  windows: TaskWindow[];
  exclusive: string | null;
  spoiler: boolean;
  renamedFrom: string[];
}
