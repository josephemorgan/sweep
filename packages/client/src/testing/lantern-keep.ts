import type { Guide, ProgressDto, RunPayloadDto } from '@sweep/core';
import type { SessionUser } from '../app/api/auth-api';
import lanternKeepJson from '../../../core/test/fixtures/valid/lantern-keep.json';

export const LANTERN_KEEP = lanternKeepJson as Guide;
export const RUN_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_USER: SessionUser = { id: 'u1', email: 'ana@sweep.test', name: 'ana' };

export function lanternKeepPayload(
  progress: Partial<ProgressDto> = {},
  name = 'LK run',
): RunPayloadDto {
  return {
    run: {
      id: RUN_ID,
      name,
      game: 'Lantern Keep',
      title: 'Completionist checklist',
      currentVersion: 1,
      createdAt: '2026-09-29T10:00:00.000Z',
      updatedAt: '2026-09-29T10:00:00.000Z',
    },
    guide: LANTERN_KEEP,
    progress: { cleared: [], pin: null, tasks: {}, tracked: {}, ...progress },
  };
}
