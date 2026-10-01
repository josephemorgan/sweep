// Shared shapes of the demo sandbox (spec §6.6). The demo keeps runs in memory, per session,
// mirroring the runs / guide_versions rows without ever writing them.
import type { Guide, RunProgress } from '@sweep/core';
import type { GuideContainer } from '../db/schema.js';

/** One guide version held in memory (the guide_versions columns the API needs). */
export interface DemoVersion {
  version: number;
  /** Original upload name, for display. */
  filename: string;
  container: GuideContainer;
  source: string;
  bytes: number;
  sha256: string;
  guide: Guide;
}

/** A seeded run every new sandbox starts with. Loaded once at start-up from packages/server/demo/. */
export interface DemoTemplate {
  name: string;
  /** Version 1 of the run. */
  version: DemoVersion;
  progress: RunProgress;
  /** How long before "now" the run was created, so the list looks lived-in. */
  createdAgoMs: number;
  /** How long before "now" the run was last played (updated_at). */
  playedAgoMs: number;
}

export interface DemoLimits {
  /** Runs per sandbox, templates included (409 quota-runs). */
  runsPerSandbox: number;
  /** Guide versions per run (409 quota-versions). */
  versionsPerRun: number;
  /** Uploaded source bytes per sandbox; templates don't count (409 quota-storage). */
  sourceBytesPerSandbox: number;
  /** Uploaded source bytes across every live sandbox (409 quota-storage). */
  sourceBytesTotal: number;
  /** A sandbox untouched for this long is dropped. */
  sandboxTtlMs: number;
  /** Live sandboxes at most; past it the least recently touched one is dropped. */
  maxSandboxes: number;
}

export const DEMO_LIMITS: DemoLimits = {
  runsPerSandbox: 10,
  versionsPerRun: 5,
  sourceBytesPerSandbox: 4 * 1024 * 1024,
  sourceBytesTotal: 64 * 1024 * 1024,
  sandboxTtlMs: 6 * 60 * 60_000,
  maxSandboxes: 500,
};
