import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { DryRunCreateResponseDto, Issue } from '@sweep/core';
import { ApiError } from '../../api/api-error';
import { RunsApi } from '../../api/runs-api';
import { createRunsApiFake, type RunsApiFake } from '../../../testing/fake-runs-api';
import { NewRunPage } from './new-run-page';

const OK: DryRunCreateResponseDto = {
  issues: [],
  summary: {
    game: 'Lantern Keep',
    title: 'Completionist checklist',
    sections: 9,
    leaves: 7,
    tasks: 8,
    categories: 4,
  },
};
const ERROR: Issue = {
  severity: 'error',
  code: 'limit',
  message: 'The guide took too long to check.',
  file: null,
  line: null,
  column: null,
  path: null,
};
const yaml = (): File => new File(['sweep: 1'], 'lantern-keep.yaml');

async function setup(api: RunsApiFake) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: RunsApi, useValue: api }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(NewRunPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  const nameInput = (): HTMLInputElement | null =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Run name'))
      ?.querySelector('input') ?? null;
  return { fixture, el, page: fixture.componentInstance, navigate, button, nameInput };
}

describe('NewRunPage', () => {
  it('dry-runs the file, defaults the name to the guide title, and creates the run', async () => {
    const api = createRunsApiFake();
    api.dryRunCreate.mockResolvedValue(OK);
    api.createRun.mockResolvedValue({ runId: 'r1' });
    const { fixture, page, navigate, button, nameInput } = await setup(api);
    const file = yaml();
    await page.pick(file);
    await fixture.whenStable();
    expect(api.dryRunCreate).toHaveBeenCalledWith(file);
    expect(nameInput()?.value).toBe('Completionist checklist');
    button('Create')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/runs/r1'));
    expect(api.createRun).toHaveBeenCalledWith(file, 'Completionist checklist');
  });

  it('trims the name, and sends the guide title when the name is blank', async () => {
    const api = createRunsApiFake();
    api.dryRunCreate.mockResolvedValue(OK);
    api.createRun.mockResolvedValue({ runId: 'r1' });
    const { fixture, page, navigate, button, nameInput } = await setup(api);
    await page.pick(yaml());
    await fixture.whenStable();
    const input = nameInput()!;
    input.value = '  My run  ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    button('Create')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(api.createRun).toHaveBeenLastCalledWith(expect.any(File), 'My run');

    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    button('Create')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(api.createRun).toHaveBeenLastCalledWith(expect.any(File), 'Completionist checklist');
  });

  it('blocks creating when the report has errors', async () => {
    const api = createRunsApiFake();
    api.dryRunCreate.mockResolvedValue({ issues: [ERROR], summary: null });
    const { fixture, el, page, button } = await setup(api);
    await page.pick(yaml());
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('1 error must be fixed');
    expect(button('Create')).toBeUndefined();
  });

  it('shows the one-parse-at-a-time 429 and retries with the same file', async () => {
    const api = createRunsApiFake();
    api.dryRunCreate
      .mockRejectedValueOnce(
        new ApiError(429, 'rate-limited', 'Another guide is still being checked.'),
      )
      .mockResolvedValue(OK);
    const { fixture, el, page, button } = await setup(api);
    const file = yaml();
    await page.pick(file);
    await fixture.whenStable();
    expect(el.textContent).toContain('Another guide is still being checked.');
    button('Try again')!.click();
    await vi.waitFor(() => expect(api.dryRunCreate).toHaveBeenCalledTimes(2));
    await fixture.whenStable();
    expect(api.dryRunCreate).toHaveBeenLastCalledWith(file);
    expect(button('Create')).toBeDefined();
  });

  it('shows the issues of a 422 on create (e.g. a parse timeout)', async () => {
    const api = createRunsApiFake();
    api.dryRunCreate.mockResolvedValue(OK);
    api.createRun.mockRejectedValue(
      new ApiError(422, 'invalid-guide', 'The guide has errors.', [ERROR]),
    );
    const { fixture, el, page, button } = await setup(api);
    await page.pick(yaml());
    await fixture.whenStable();
    button('Create')!.click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(el.textContent).toContain('The guide took too long to check.');
    });
  });

  it('rejects a wrong extension or an oversized file without uploading', async () => {
    const api = createRunsApiFake();
    const { fixture, el, page } = await setup(api);
    await page.pick(new File(['x'], 'guide.txt'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Choose a .yaml, .yml or .md file.');
    await page.pick(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.yaml'));
    await fixture.whenStable();
    expect(el.textContent).toContain('2 MiB or smaller');
    expect(api.dryRunCreate).not.toHaveBeenCalled();
  });
});
