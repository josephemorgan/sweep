import { Component, computed, input } from '@angular/core';
import { renderMarkdown } from './markdown';

@Component({
  selector: 'app-markdown-view',
  template: `<div class="prose-md" [innerHTML]="html()"></div>`,
})
export class MarkdownView {
  readonly source = input.required<string>();
  protected readonly html = computed(() => renderMarkdown(this.source()));
}
