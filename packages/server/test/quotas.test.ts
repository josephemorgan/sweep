import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUOTAS, type Quotas } from '../src/limits.js';
import {
  assertRunQuota,
  assertStorageQuota,
  assertVersionQuota,
  lockUserQuota,
} from '../src/runs/quotas.js';
import { TINY_YAML } from './helpers/guides.js';
import { seedRun, seedUser } from './helpers/seed.js';
import { createTestDb, type TestDb } from './helpers/test-db.js';

const TINY_BYTES = Buffer.byteLength(TINY_YAML);

describe('quotas', () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.drop();
  });

  it('matches spec §6.5', () => {
    expect(QUOTAS).toEqual({
      runsPerUser: 50,
      versionsPerRun: 100,
      sourceBytesPerUser: 100 * 1024 * 1024,
    });
  });

  it('allows runs below the limit and refuses one at it', async () => {
    const userId = await seedUser(testDb.db, 'runs@example.com');
    const quotas: Quotas = { ...QUOTAS, runsPerUser: 2 };
    await seedRun(testDb.db, userId);
    await expect(assertRunQuota(testDb.db, userId, quotas)).resolves.toBeUndefined();
    await seedRun(testDb.db, userId);
    await expect(assertRunQuota(testDb.db, userId, quotas)).rejects.toMatchObject({
      status: 409,
      code: 'quota-runs',
    });
  });

  it('counts versions per run', async () => {
    const userId = await seedUser(testDb.db, 'versions@example.com');
    const runId = await seedRun(testDb.db, userId);
    await expect(
      assertVersionQuota(testDb.db, runId, { ...QUOTAS, versionsPerRun: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      assertVersionQuota(testDb.db, runId, { ...QUOTAS, versionsPerRun: 1 }),
    ).rejects.toMatchObject({ status: 409, code: 'quota-versions' });
  });

  it("sums the user's stored source bytes across runs, ignoring other users", async () => {
    const userId = await seedUser(testDb.db, 'bytes@example.com');
    const other = await seedUser(testDb.db, 'other@example.com');
    await seedRun(testDb.db, userId);
    await seedRun(testDb.db, userId);
    await seedRun(testDb.db, other);
    const quotas: Quotas = { ...QUOTAS, sourceBytesPerUser: TINY_BYTES * 3 };
    await expect(
      assertStorageQuota(testDb.db, userId, TINY_BYTES, quotas),
    ).resolves.toBeUndefined();
    await expect(
      assertStorageQuota(testDb.db, userId, TINY_BYTES + 1, quotas),
    ).rejects.toMatchObject({ status: 409, code: 'quota-storage' });
  });

  it('serializes concurrent creators so they cannot overshoot', async () => {
    const userId = await seedUser(testDb.db, 'race@example.com');
    const quotas: Quotas = { ...QUOTAS, runsPerUser: 1 };
    const attempt = (): Promise<string> =>
      testDb.db.transaction(async (tx) => {
        await lockUserQuota(tx, userId);
        await assertRunQuota(tx, userId, quotas);
        return seedRun(tx, userId);
      });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'quota-runs' });
    }
  });
});
