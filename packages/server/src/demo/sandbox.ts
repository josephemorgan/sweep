// In-memory demo sandboxes (spec §6.6): one per session, seeded from the templates, never persisted.
import { randomUUID } from 'node:crypto';
import { diffGuides, migrateProgress, type Guide, type RunProgress } from '@sweep/core';
import type { RunRow } from '../db/schema.js';
import type { ParsedUpload } from '../guides/core-adapter.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { defaultRunName } from '../runs/create-run.js';
import { staleVersion } from '../runs/update-guide.js';
import { DEMO_LIMITS, type DemoLimits, type DemoTemplate, type DemoVersion } from './types.js';

/** A run in a sandbox: the runs row, its guide versions (oldest first) and its progress. */
export interface DemoRun {
  row: RunRow;
  /** versions[versions.length - 1].version === row.currentVersion. */
  versions: DemoVersion[];
  progress: RunProgress;
}

/** Uploaded bytes across every live sandbox; shared so each sandbox can check the global cap. */
interface ByteLedger {
  total: number;
}

function copyProgress(p: RunProgress): RunProgress {
  return {
    cleared: new Set(p.cleared),
    pin: p.pin,
    tasks: new Map(p.tasks),
    tracked: new Map(p.tracked),
  };
}

function versionOf(version: number, upload: ParsedUpload, guide: Guide): DemoVersion {
  return {
    version,
    filename: upload.displayName,
    container: upload.container,
    source: upload.source,
    bytes: upload.bytes,
    sha256: upload.sha256,
    guide,
  };
}

export class DemoSandbox {
  readonly runs = new Map<string, DemoRun>();
  /** Last touch, in `now()` milliseconds. Managed by DemoSandboxes. */
  touchedAt: number;
  /** Uploaded source bytes held by this sandbox (template bytes don't count). */
  bytes = 0;
  private readonly uploaded = new Map<string, number>();

  constructor(
    templates: readonly DemoTemplate[],
    private readonly userId: string,
    private readonly limits: DemoLimits,
    private readonly now: () => number,
    private readonly ledger: ByteLedger,
  ) {
    const at = now();
    this.touchedAt = at;
    for (const t of templates) {
      const id = randomUUID();
      this.runs.set(id, {
        row: {
          id,
          userId,
          name: t.name,
          currentVersion: t.version.version,
          pinnedSectionId: t.progress.pin,
          createdAt: new Date(at - t.createdAgoMs),
          updatedAt: new Date(at - t.playedAgoMs),
        },
        // Guides are immutable, so the version (and its Guide) is shared with the template.
        versions: [t.version],
        progress: copyProgress(t.progress),
      });
    }
  }

  /** updatedAt desc, then id desc: the order GET /runs uses. */
  list(): DemoRun[] {
    return [...this.runs.values()].sort((a, b) => {
      const byTime = b.row.updatedAt.getTime() - a.row.updatedAt.getTime();
      if (byTime !== 0) return byTime;
      return a.row.id < b.row.id ? 1 : a.row.id > b.row.id ? -1 : 0;
    });
  }

  find(runId: string): DemoRun | undefined {
    return this.runs.get(runId);
  }

  private require(runId: string): DemoRun {
    const run = this.runs.get(runId);
    if (!run) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    return run;
  }

  private assertStorage(addBytes: number): void {
    if (
      this.bytes + addBytes > this.limits.sourceBytesPerSandbox ||
      this.ledger.total + addBytes > this.limits.sourceBytesTotal
    ) {
      throw new HttpError(
        409,
        ApiErrorCode.QuotaStorage,
        'Your stored guides are at the storage limit. Delete a run to free space.',
      );
    }
  }

  private addBytes(runId: string, bytes: number): void {
    this.bytes += bytes;
    this.ledger.total += bytes;
    this.uploaded.set(runId, (this.uploaded.get(runId) ?? 0) + bytes);
  }

  /** Gives back everything this sandbox holds (it is being dropped). */
  release(): void {
    this.ledger.total -= this.bytes;
    this.bytes = 0;
    this.uploaded.clear();
    this.runs.clear();
  }

  createRun(input: { name: string | undefined; upload: ParsedUpload; guide: Guide }): DemoRun {
    if (this.runs.size >= this.limits.runsPerSandbox) {
      throw new HttpError(
        409,
        ApiErrorCode.QuotaRuns,
        `You can have at most ${this.limits.runsPerSandbox} runs. Delete one to start another.`,
      );
    }
    this.assertStorage(input.upload.bytes);
    const at = new Date(this.now());
    const id = randomUUID();
    const run: DemoRun = {
      row: {
        id,
        userId: this.userId,
        name: input.name ?? defaultRunName(input.guide),
        currentVersion: 1,
        pinnedSectionId: null,
        createdAt: at,
        updatedAt: at,
      },
      versions: [versionOf(1, input.upload, input.guide)],
      progress: { cleared: new Set(), pin: null, tasks: new Map(), tracked: new Map() },
    };
    this.runs.set(id, run);
    this.addBytes(id, input.upload.bytes);
    return run;
  }

  /** updated_at stays as it is: a rename isn't play. */
  rename(runId: string, name: string): DemoRun {
    const run = this.require(runId);
    run.row.name = name;
    return run;
  }

  delete(runId: string): void {
    this.runs.delete(runId);
    const bytes = this.uploaded.get(runId) ?? 0;
    this.bytes -= bytes;
    this.ledger.total -= bytes;
    this.uploaded.delete(runId);
  }

  mutateProgress(runId: string, change: (p: RunProgress) => RunProgress): void {
    const run = this.require(runId);
    run.progress = change(run.progress);
    run.row.pinnedSectionId = run.progress.pin;
    run.row.updatedAt = new Date(this.now());
  }

  addVersion(
    runId: string,
    input: { upload: ParsedUpload; guide: Guide; baseVersion: number },
  ): DemoRun {
    const run = this.require(runId);
    if (run.row.currentVersion !== input.baseVersion) throw staleVersion();
    if (run.versions.length >= this.limits.versionsPerRun) {
      throw new HttpError(
        409,
        ApiErrorCode.QuotaVersions,
        `A run keeps at most ${this.limits.versionsPerRun} guide versions. Start a new run to keep updating.`,
      );
    }
    this.assertStorage(input.upload.bytes);
    const current = run.versions[run.versions.length - 1];
    if (!current) throw new Error('addVersion: run has no versions');
    const diff = diffGuides(current.guide, input.guide, run.progress);
    const next = run.row.currentVersion + 1;
    run.versions.push(versionOf(next, input.upload, input.guide));
    run.progress = migrateProgress(run.progress, diff);
    run.row.pinnedSectionId = run.progress.pin;
    run.row.currentVersion = next;
    run.row.updatedAt = new Date(this.now());
    this.addBytes(runId, input.upload.bytes);
    return run;
  }
}

export interface DemoSandboxesOptions {
  limits?: Partial<DemoLimits> | undefined;
  now?: (() => number) | undefined;
}

export class DemoSandboxes {
  private readonly limits: DemoLimits;
  private readonly now: () => number;
  private readonly ledger: ByteLedger = { total: 0 };
  /** Least recently touched first: touching deletes and re-sets the key. */
  private readonly sandboxes = new Map<string, DemoSandbox>();

  constructor(
    private readonly templates: readonly DemoTemplate[],
    options: DemoSandboxesOptions = {},
  ) {
    this.limits = { ...DEMO_LIMITS, ...options.limits };
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.sandboxes.size;
  }

  /** `userId` is only used when the sandbox is created: it is the session's user. */
  get(sessionId: string, userId = ''): DemoSandbox {
    const at = this.now();
    for (const [id, sandbox] of this.sandboxes) {
      if (at - sandbox.touchedAt <= this.limits.sandboxTtlMs) break;
      this.drop(id, sandbox);
    }
    let sandbox = this.sandboxes.get(sessionId);
    if (sandbox) this.sandboxes.delete(sessionId);
    else sandbox = new DemoSandbox(this.templates, userId, this.limits, this.now, this.ledger);
    sandbox.touchedAt = at;
    this.sandboxes.set(sessionId, sandbox);
    while (this.sandboxes.size > this.limits.maxSandboxes) {
      const oldest = this.sandboxes.entries().next();
      if (oldest.done) break;
      this.drop(oldest.value[0], oldest.value[1]);
    }
    return sandbox;
  }

  private drop(id: string, sandbox: DemoSandbox): void {
    this.sandboxes.delete(id);
    sandbox.release();
  }
}
