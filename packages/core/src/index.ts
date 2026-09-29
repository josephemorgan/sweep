// @sweep/core main entry (spec §4.12). Safe for the browser: no parser, no I/O.
export { FORMAT_VERSION, MODEL_VERSION } from './model/versions.js';
export { END } from './model/guide.js';
export type { Category, Guide, Requires, Section, Task, TaskWindow } from './model/guide.js';
export {
  emptyProgress,
  progressFromDto,
  progressToDto,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
} from './model/progress.js';
export type { RunProgress, TaskState } from './model/progress.js';
export type { Issue, IssueCode, IssueSeverity } from './model/issue.js';
export type {
  ApiErrorDto,
  ApplyGuideResponseDto,
  CreateRunResponseDto,
  DryRunCreateResponseDto,
  DryRunUpdateResponseDto,
  GuideSummaryDto,
  ProgressDto,
  RenameRunBody,
  RunDto,
  RunPayloadDto,
  RunSummaryDto,
  SetCategoryBody,
  SetPinBody,
  SetSectionBody,
  SetTaskBody,
} from './model/api.js';

export { SectionState, WindowStatus, deriveCore, deriveRun } from './engine/derive.js';
export type { CoreView, SectionView, TaskStatus, TaskStatusKind } from './engine/derive.js';
export type {
  CardCategory,
  CardRow,
  CardView,
  GroupProgress,
  RunSummary,
  RunView,
} from './engine/cards.js';
export { clearImpact } from './engine/clear-impact.js';
export type { ClearImpact, ClosingTask } from './engine/clear-impact.js';
export { deriveMetrics } from './engine/metrics.js';
export type { Metrics } from './engine/metrics.js';
export { guideSummary } from './engine/summary.js';
export { ProgressKind, diffGuides } from './diff/diff-guides.js';
export type {
  Edited,
  GuideDiff,
  KindDiff,
  ProgressDiff,
  ProgressMigration,
  ProgressRef,
  Renamed,
} from './diff/diff-guides.js';
export { migrateProgress } from './diff/migrate-progress.js';
