import { Service, inject } from '@angular/core';
import type { RunPayloadDto } from '@sweep/core';
import { Session } from '../auth/session';
import { SafeStorage } from '../shared/safe-storage';

interface ResumeEntry {
  runId: string;
  payload?: RunPayloadDto;
}

export function resumeKey(userId: string): string {
  return `sweep.resume.${userId}`;
}

/**
 * The last opened run and its last server payload, per user (spec §5.7 "Resume"). A payload too
 * big for storage degrades to the run ID alone: resume still opens the run, from the network.
 */
@Service()
export class ResumeCache {
  private readonly storage = inject(SafeStorage);
  private readonly session = inject(Session);

  lastRunId(): string | null {
    return this.entry()?.runId ?? null;
  }

  read(runId: string): RunPayloadDto | null {
    const entry = this.entry();
    return entry?.runId === runId ? (entry.payload ?? null) : null;
  }

  write(payload: RunPayloadDto): boolean {
    const key = this.key();
    if (key === null) return false;
    const runId = payload.run.id;
    if (this.storage.write(key, { runId, payload } satisfies ResumeEntry)) return true;
    this.storage.write(key, { runId } satisfies ResumeEntry);
    return false;
  }

  forget(runId: string): void {
    if (this.entry()?.runId === runId) this.clear();
  }

  clear(): void {
    const key = this.key();
    if (key !== null) this.storage.remove(key);
  }

  private key(): string | null {
    const user = this.session.user();
    return user ? resumeKey(user.id) : null;
  }

  private entry(): ResumeEntry | null {
    const key = this.key();
    if (key === null) return null;
    const e = this.storage.read<Partial<ResumeEntry>>(key);
    if (typeof e?.runId !== 'string') return null;
    const p = e.payload;
    const valid =
      p?.run?.id === e.runId &&
      Array.isArray(p.guide?.sections) &&
      Array.isArray(p.progress?.cleared);
    return valid ? { runId: e.runId, payload: p } : { runId: e.runId };
  }
}
