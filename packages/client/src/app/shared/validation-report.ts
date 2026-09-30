import { Component, computed, input } from '@angular/core';
import type { GuideSummaryDto, Issue } from '@sweep/core';

export function issueLocation(issue: Issue): string {
  return issue.line === null ? 'No location' : `Line ${issue.line}, column ${issue.column ?? 1}`;
}

@Component({
  selector: 'app-validation-report',
  template: `
    <div class="flex flex-col gap-3">
      @if (summary(); as s) {
        <div>
          <p class="m-0 font-semibold">{{ s.game }} · {{ s.title }}</p>
          <p class="m-0 text-sm text-fg-muted">
            {{ s.sections }} sections ({{ s.leaves }} to clear), {{ s.tasks }} tasks,
            {{ s.categories }} categories
          </p>
        </div>
      }
      @if (errors().length > 0) {
        <div role="alert" class="rounded-panel border border-missed p-3">
          <p class="m-0 font-semibold text-missed">{{ headline() }}</p>
          <ul class="m-0 mt-2 list-none p-0 text-sm">
            @for (item of errors(); track $index) {
              <li class="py-1">
                <span class="font-mono text-fg-muted">{{ location(item) }}:</span>
                {{ item.message }}
                <span class="text-fg-muted">({{ item.code }})</span>
              </li>
            }
          </ul>
        </div>
      } @else if (summary()) {
        <p class="m-0 text-sm text-open">No errors.</p>
      }
      @if (warnings().length > 0) {
        <details class="rounded-panel border border-border px-3">
          <summary class="flex min-h-11 cursor-pointer items-center">
            {{ warnings().length }} {{ warnings().length === 1 ? 'warning' : 'warnings' }}
          </summary>
          <ul class="m-0 list-none p-0 pb-2 text-sm">
            @for (item of warnings(); track $index) {
              <li class="py-1">
                <span class="font-mono text-fg-muted">{{ location(item) }}:</span>
                {{ item.message }}
                <span class="text-fg-muted">({{ item.code }})</span>
              </li>
            }
          </ul>
        </details>
      }
    </div>
  `,
})
export class ValidationReport {
  readonly issues = input.required<readonly Issue[]>();
  readonly summary = input<GuideSummaryDto | null>(null);
  protected readonly errors = computed(() => this.issues().filter((i) => i.severity === 'error'));
  protected readonly warnings = computed(() =>
    this.issues().filter((i) => i.severity === 'warning'),
  );
  protected readonly headline = computed(() => {
    const n = this.errors().length;
    return `${n} ${n === 1 ? 'error' : 'errors'} must be fixed before this guide can be used.`;
  });
  protected readonly location = issueLocation;
}
