// API DTO types (spec §4.12). Types only: shared by the server and the client.
import type { GuideDiff } from '../diff/diff-guides.js';
import type { Guide } from './guide.js';
import type { Issue } from './issue.js';
import type { TaskState } from './progress.js';

export interface ProgressDto {
  cleared: string[];
  pin: string | null;
  tasks: Record<string, TaskState>;
  tracked: Record<string, boolean>;
}
export interface RunDto {
  id: string;
  name: string;
  game: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface RunSummaryDto extends RunDto {
  leavesCleared: number;
  leavesTotal: number;
  tasksDone: number;
  tasksTotal: number;
}
export interface RunPayloadDto {
  run: RunDto;
  guide: Guide;
  progress: ProgressDto;
}
export interface GuideSummaryDto {
  game: string;
  title: string;
  sections: number;
  leaves: number;
  tasks: number;
  categories: number;
}
export interface DryRunCreateResponseDto {
  issues: Issue[];
  summary: GuideSummaryDto | null;
}
export interface CreateRunResponseDto {
  runId: string;
}
export interface DryRunUpdateResponseDto {
  issues: Issue[];
  diff: GuideDiff | null;
}
export type ApplyGuideResponseDto = RunPayloadDto;
export interface ApiErrorDto {
  error: { code: string; message: string; issues?: Issue[] };
}
export interface RenameRunBody {
  name: string;
}
export interface SetSectionBody {
  cleared: boolean;
}
export interface SetPinBody {
  sectionId: string | null;
}
export interface SetTaskBody {
  state: TaskState | null;
}
export interface SetCategoryBody {
  tracked: boolean | null;
}
