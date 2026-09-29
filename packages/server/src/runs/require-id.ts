import type { Executor } from '../db/client.js';
import { loadCurrentGuide, type RunRef } from '../guides/store.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { indexGuide } from './guide-index.js';

const KIND_LABEL = { leaves: 'a leaf', tasks: 'a task', categories: 'a category' } as const;
export type IdKind = keyof typeof KIND_LABEL;

/** Spec §6.2: write targets must exist with the right kind in the CURRENT guide version. */
export async function requireId(
  ex: Executor,
  run: RunRef,
  kind: IdKind,
  id: string,
): Promise<void> {
  const { guide } = await loadCurrentGuide(ex, run);
  if (!indexGuide(guide)[kind].has(id)) {
    throw new HttpError(
      422,
      ApiErrorCode.UnknownId,
      `"${id}" is not ${KIND_LABEL[kind]} in this run's current guide.`,
    );
  }
}
