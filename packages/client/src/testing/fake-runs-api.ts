import type { Mock } from 'vitest';
import type { RunsApi } from '../app/api/runs-api';

export type RunsApiFake = { [K in keyof RunsApi]: Mock<RunsApi[K]> };

/** A RunsApi with every method a vi.fn(); provide it with `{ provide: RunsApi, useValue: fake }`. */
export function createRunsApiFake(): RunsApiFake {
  return {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    dryRunCreate: vi.fn(),
    createRun: vi.fn(),
    renameRun: vi.fn(),
    deleteRun: vi.fn(),
    setSection: vi.fn(),
    setPin: vi.fn(),
    setTask: vi.fn(),
    setCategory: vi.fn(),
    dryRunUpdate: vi.fn(),
    applyUpdate: vi.fn(),
  };
}
