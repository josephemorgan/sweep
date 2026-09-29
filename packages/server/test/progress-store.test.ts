import { emptyProgress, ProgressKind, setCleared, setPin, type RunProgress } from '@sweep/core';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runs, sectionProgress, taskProgress } from '../src/db/schema.js';
import {
  lockRun,
  mutateProgress,
  readProgress,
  writeProgressChanges,
} from '../src/runs/progress-store.js';
import { seedRun, seedUser } from './helpers/seed.js';
import { createTestDb, type TestDb } from './helpers/test-db.js';

function progress(p: Partial<RunProgress>): RunProgress {
  return { ...emptyProgress(), ...p };
}

describe('progress store', () => {
  let testDb: TestDb;
  let userId: string;
  let runId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    userId = await seedUser(testDb.db, 'ann@example.com');
  });
  afterAll(async () => {
    await testDb.drop();
  });
  beforeEach(async () => {
    runId = await seedRun(testDb.db, userId);
  });

  it('reads empty progress for a new run', async () => {
    expect(await readProgress(testDb.db, runId)).toEqual(emptyProgress());
  });

  it('writes every kind of change and reads it back', async () => {
    const after = progress({
      cleared: new Set(['village']),
      pin: 'marsh',
      tasks: new Map([['chest', 'done']]),
      tracked: new Map([['lore', true]]),
    });
    await writeProgressChanges(testDb.db, runId, emptyProgress(), after);
    expect(await readProgress(testDb.db, runId)).toEqual(after);

    const next = progress({ tasks: new Map([['chest', 'dont-care']]) });
    await writeProgressChanges(testDb.db, runId, after, next);
    expect(await readProgress(testDb.db, runId)).toEqual(next);
  });

  it('bumps runs.updated_at', async () => {
    const old = new Date('2000-01-01T00:00:00Z');
    await testDb.db.update(runs).set({ updatedAt: old }).where(eq(runs.id, runId));
    await writeProgressChanges(testDb.db, runId, emptyProgress(), emptyProgress());
    const row = await lockRun(testDb.db, runId);
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('applies renames in place, keeping cleared_at and updated_at', async () => {
    const before = progress({
      cleared: new Set(['marsh']),
      pin: 'keep',
      tasks: new Map([['herbs', 'done']]),
    });
    await writeProgressChanges(testDb.db, runId, emptyProgress(), before);
    const stamp = new Date('2001-02-03T04:05:06Z');
    await testDb.db
      .update(sectionProgress)
      .set({ clearedAt: stamp })
      .where(eq(sectionProgress.runId, runId));
    await testDb.db
      .update(taskProgress)
      .set({ updatedAt: stamp })
      .where(eq(taskProgress.runId, runId));

    const after = progress({
      cleared: new Set(['swamp']),
      pin: 'castle',
      tasks: new Map([['swamp-herbs', 'done']]),
    });
    await writeProgressChanges(testDb.db, runId, before, after, [
      { kind: ProgressKind.Cleared, from: 'marsh', to: 'swamp' },
      { kind: ProgressKind.Pin, from: 'keep', to: 'castle' },
      { kind: ProgressKind.Task, from: 'herbs', to: 'swamp-herbs' },
    ]);

    expect(await readProgress(testDb.db, runId)).toEqual(after);
    const [cleared] = await testDb.db
      .select()
      .from(sectionProgress)
      .where(and(eq(sectionProgress.runId, runId), eq(sectionProgress.sectionId, 'swamp')));
    expect(cleared?.clearedAt.toISOString()).toBe(stamp.toISOString());
    const [task] = await testDb.db
      .select()
      .from(taskProgress)
      .where(and(eq(taskProgress.runId, runId), eq(taskProgress.taskId, 'swamp-herbs')));
    expect(task?.updatedAt.toISOString()).toBe(stamp.toISOString());
  });

  it('leaves both rows when the rename target already has progress', async () => {
    const both = progress({ cleared: new Set(['marsh', 'swamp']) });
    await writeProgressChanges(testDb.db, runId, emptyProgress(), both);
    await writeProgressChanges(testDb.db, runId, both, both, [
      { kind: ProgressKind.Cleared, from: 'marsh', to: 'swamp' },
    ]);
    expect((await readProgress(testDb.db, runId)).cleared).toEqual(new Set(['marsh', 'swamp']));
  });

  it('writes large batches', async () => {
    const ids = Array.from({ length: 2_500 }, (_, i) => `s${i}`);
    const after = progress({ cleared: new Set(ids) });
    await writeProgressChanges(testDb.db, runId, emptyProgress(), after);
    expect((await readProgress(testDb.db, runId)).cleared.size).toBe(2_500);
    await writeProgressChanges(testDb.db, runId, after, emptyProgress());
    expect((await readProgress(testDb.db, runId)).cleared.size).toBe(0);
  });

  it('mutateProgress runs a core setter in one transaction', async () => {
    await mutateProgress(testDb.db, runId, (p) => setPin(p, 'marsh'));
    // setCleared on the pinned leaf also removes the pin.
    await mutateProgress(testDb.db, runId, (p) => setCleared(p, 'marsh', true));
    expect(await readProgress(testDb.db, runId)).toEqual(progress({ cleared: new Set(['marsh']) }));
  });

  it('lockRun answers a missing run with 404', async () => {
    await expect(lockRun(testDb.db, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      status: 404,
      code: 'not-found',
    });
  });
});
