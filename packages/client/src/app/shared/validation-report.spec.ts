import { TestBed } from '@angular/core/testing';
import type { GuideSummaryDto, Issue } from '@sweep/core';
import { ValidationReport, issueLocation } from './validation-report';

const issue = (over: Partial<Issue>): Issue => ({
  severity: 'error',
  code: 'unknown-section',
  message: 'Unknown section "mrash".',
  file: 'guide.yaml',
  line: 12,
  column: 9,
  path: 'tasks[3].windows[0].from',
  ...over,
});
const SUMMARY: GuideSummaryDto = {
  game: 'Lantern Keep',
  title: 'Completionist checklist',
  sections: 9,
  leaves: 7,
  tasks: 8,
  categories: 4,
};

async function render(issues: Issue[], summary: GuideSummaryDto | null) {
  const fixture = TestBed.createComponent(ValidationReport);
  fixture.componentRef.setInput('issues', issues);
  fixture.componentRef.setInput('summary', summary);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ValidationReport', () => {
  it('formats issue locations', () => {
    expect(issueLocation(issue({}))).toBe('Line 12, column 9');
    expect(issueLocation(issue({ line: null, column: null }))).toBe('No location');
  });

  it('shows a clean summary', async () => {
    const el = await render([], SUMMARY);
    expect(el.textContent).toContain('Lantern Keep · Completionist checklist');
    expect(el.textContent).toContain('9 sections (7 to clear), 8 tasks, 4 categories');
    expect(el.textContent).toContain('No errors.');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('blocks on errors and lists each with its location', async () => {
    const el = await render(
      [
        issue({}),
        issue({
          code: 'limit',
          message: 'The guide took too long to check.',
          line: null,
          column: null,
        }),
      ],
      null,
    );
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('2 errors must be fixed before this guide can be used.');
    expect(alert.textContent).toContain('Line 12, column 9');
    expect(alert.textContent).toContain('The guide took too long to check.');
  });

  it('collapses warnings', async () => {
    const el = await render(
      [issue({ severity: 'warning', code: 'md-html', message: 'Raw HTML is shown as text.' })],
      SUMMARY,
    );
    const details = el.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('1 warning');
    expect(el.textContent).toContain('No errors.');
  });
});
