// @sweep/core main entry (spec §4.12). Safe for the browser: no parser, no I/O.
// Session A adds deriveRun, clearImpact, diffGuides, migrateProgress and API DTO types here.
export { FORMAT_VERSION, MODEL_VERSION } from './model/versions.js';
export type { Category, Guide, Requires, Section, Task, Window } from './model/guide.js';
export type { RunProgress, TaskState } from './model/progress.js';
export type { Issue, IssueCode, IssueSeverity } from './model/issue.js';
