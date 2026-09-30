import {
  progressFromDto,
  progressToDto,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
  type RunPayloadDto,
  type RunProgress,
} from '@sweep/core';
import type { QueuedWrite } from './queued-write';

/** `write` applied to `progress`, exactly as the server applies it (core's setters). */
export function applyToProgress(progress: RunProgress, write: QueuedWrite): RunProgress {
  switch (write.kind) {
    case 'section':
      return setCleared(progress, write.sectionId, write.cleared);
    case 'pin':
      return setPin(progress, write.sectionId);
    case 'task':
      return setTaskState(progress, write.taskId, write.state);
    case 'category':
      return setTracked(progress, write.categoryId, write.tracked);
    case 'run-name':
      return progress;
  }
}

/** The server's copy of a run after it accepted `write`. Other runs' writes leave it unchanged. */
export function applyToPayload(payload: RunPayloadDto, write: QueuedWrite): RunPayloadDto {
  if (write.runId !== payload.run.id) return payload;
  if (write.kind === 'run-name') return { ...payload, run: { ...payload.run, name: write.name } };
  const progress = applyToProgress(progressFromDto(payload.progress), write);
  return { ...payload, progress: progressToDto(progress) };
}
