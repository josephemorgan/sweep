import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ClearImpact } from '@sweep/core';
import { lockReason } from './lock-reason';
import { taskHome } from './metric-groups';
import { Reveals } from './reveals';
import { RunStore } from './run-store';
import { sectionLabel, taskBlurred, taskRevealKey } from './spoiler';
import { SpoilerText } from './spoiler-text';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

@Component({
  selector: 'app-clear-dialog',
  imports: [SpoilerText],
  template: `
    <div class="flex flex-col gap-3 px-5 pb-5">
      @if (lockedText(); as text) {
        <p class="m-0 text-[15px] leading-[21px] text-missed">{{ text }}</p>
      }
      @if (impact().closing.length > 0) {
        <p class="m-0 text-[15px] leading-[21px]">{{ closesText() }}</p>
        <ul class="m-0 list-none border-t border-rule p-0">
          @for (row of rows(); track row.taskId) {
            <li class="flex min-h-12 items-center gap-3 border-b border-rule">
              <span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-last-chance"></span>
              <span class="flex min-w-0 flex-1 flex-col">
                <app-spoiler-text
                  [text]="title(row.taskId)"
                  [hidden]="blurred(row.taskId)"
                  [revealKey]="revealKey(row.taskId)"
                  label="Hidden spoiler task. Tap to reveal."
                />
                <span class="text-xs text-fg-muted">{{ row.sub }}</span>
              </span>
              @if (row.next; as next) {
                <span class="text-xs text-fg-muted">2nd chance at {{ next }}</span>
              } @else {
                <span class="text-xs font-bold text-last-chance">Gone for good</span>
              }
            </li>
          }
        </ul>
      }
      <p class="m-0 text-[13px] leading-[18px] text-fg-muted">Everything else here stays open.</p>
      <div class="flex justify-end gap-2 pt-1">
        <button #cancel type="button" class="btn" (click)="cancelled.emit()">Stay here</button>
        <button type="button" class="btn-primary" (click)="confirmed.emit()">Clear anyway</button>
      </div>
    </div>
  `,
})
export class ClearDialog {
  readonly leafId = input.required<string>();
  readonly impact = input.required<ClearImpact>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancel');
  private readonly store = inject(RunStore);
  private readonly reveals = inject(Reveals);
  protected readonly revealKey = taskRevealKey;

  constructor() {
    // Focus Stay here explicitly: the destructive action must not be the initial focus.
    afterNextRender(() => this.cancelButton().nativeElement.focus());
  }

  protected readonly lockedText = computed(() => {
    if (!this.impact().wasLocked) return null;
    const reason = lockReason(this.store.index()!, this.store.view()!, this.leafId());
    const names = reason?.ids.map((id) => this.label(id)).join(', ') ?? '';
    const requires = reason?.mode === 'any' ? `requires one of ${names}` : `requires ${names}`;
    return `${capitalize(this.label(this.leafId()))} is locked (${requires}). Clear anyway?`;
  });
  protected readonly closesText = computed(() => {
    const { closing, lastChance } = this.impact();
    const n = closing.length;
    const lead = `Clearing this section closes ${n} open ${n === 1 ? 'task' : 'tasks'}.`;
    return lastChance.length === n ? `${lead} They have no second chance.` : lead;
  });
  protected readonly rows = computed(() =>
    this.impact().closing.map((c) => {
      const index = this.store.index()!;
      const task = index.tasks.get(c.taskId)!;
      const category =
        this.store.guide()?.categories.find((k) => k.id === task.category)?.name ?? task.category;
      const homeId = taskHome(c.taskId, index, this.store.view()!);
      const home = homeId === this.leafId() ? 'here' : this.label(homeId);
      return {
        taskId: c.taskId,
        sub: `${category} · ${home}`,
        next: c.nextChance === null ? null : this.label(c.nextChance),
      };
    }),
  );

  protected title(taskId: string): string {
    return this.store.index()!.tasks.get(taskId)!.title;
  }

  protected blurred(taskId: string): boolean {
    const task = this.store.index()!.tasks.get(taskId)!;
    return taskBlurred(
      task,
      this.store.view()!.tasks.get(taskId),
      this.reveals.has(taskRevealKey(taskId)),
    );
  }

  protected label(sectionId: string): string {
    return sectionLabel(this.store.index()!, this.store.view()!, this.reveals, sectionId);
  }
}
