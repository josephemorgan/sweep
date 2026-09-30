import { TestBed } from '@angular/core/testing';
import type { DryRunUpdateResponseDto, GuideDiff } from '@sweep/core';
import { ApiError } from '../api/api-error';
import { RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { UpdateGuideSheet } from './update-guide-sheet';

const EMPTY_KIND = { added: [], removed: [], edited: [], renamed: [] };
const RENAME: GuideDiff = {
  sections: EMPTY_KIND,
  tasks: { ...EMPTY_KIND, renamed: [{ from: 'village-chest', to: 'mill-chest', fields: [] }] },
  categories: EMPTY_KIND,
  likelyRegenerated: false,
  progress: {
    migrated: [{ kind: 'task', from: 'village-chest', to: 'mill-chest' }],
    orphaned: [],
    restored: [],
  },
  labels: {
    sections: {},
    tasks: {
      'mill-chest': { title: 'Chest behind the mill', spoiler: false },
      'village-chest': { title: 'Chest behind the mill', spoiler: false },
    },
    categories: {},
  },
};
const NO_LABELS: GuideDiff['labels'] = { sections: {}, tasks: {}, categories: {} };
const PREVIEW: DryRunUpdateResponseDto = { issues: [], diff: RENAME };
const v2 = () => ({
  ...lanternKeepPayload(),
  run: { ...lanternKeepPayload().run, currentVersion: 2 },
});
const file = (): File => new File(['sweep: 1'], 'lantern-keep.yaml');

async function renderSheet() {
  const harness = await setupRunStore();
  const fixture = TestBed.createComponent(UpdateGuideSheet);
  const events: string[] = [];
  fixture.componentInstance.done.subscribe(() => events.push('done'));
  fixture.componentInstance.cancelled.subscribe(() => events.push('cancelled'));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  return { ...harness, fixture, el, events, button, sheet: fixture.componentInstance };
}

describe('UpdateGuideSheet (§5.8)', () => {
  it('previews with baseVersion, then applies and replaces the payload', async () => {
    const { api, sheet, fixture, button, store, events } = await renderSheet();
    api.dryRunUpdate.mockResolvedValue(PREVIEW);
    api.applyUpdate.mockResolvedValue(v2());
    const f = file();
    await sheet.pick(f);
    await fixture.whenStable();
    expect(api.dryRunUpdate).toHaveBeenCalledWith(RUN_ID, f, 1);
    button('Apply')!.click();
    await vi.waitFor(() => expect(events).toEqual(['done']));
    expect(api.applyUpdate).toHaveBeenCalledWith(RUN_ID, f, 1);
    expect(store.run()?.currentVersion).toBe(2);
  });

  it('offers nothing to apply for an identical file', async () => {
    const { api, sheet, fixture, el, button } = await renderSheet();
    api.dryRunUpdate.mockResolvedValue({
      issues: [],
      diff: { ...RENAME, tasks: EMPTY_KIND, progress: null, labels: NO_LABELS },
    });
    await sheet.pick(file());
    await fixture.whenStable();
    expect(el.textContent).toContain('No changes');
    expect(button('Apply')).toBeUndefined();
  });

  it('on 409 refetches and asks for a second review against the new version', async () => {
    const { api, sheet, fixture, el } = await renderSheet();
    api.dryRunUpdate.mockResolvedValue(PREVIEW);
    api.applyUpdate.mockRejectedValue(
      new ApiError(409, 'stale-version', 'A newer guide version exists.'),
    );
    api.getRun.mockResolvedValue(v2());
    await sheet.pick(file());
    await sheet.apply();
    await fixture.whenStable();
    expect(api.dryRunUpdate).toHaveBeenLastCalledWith(RUN_ID, expect.any(File), 2);
    expect(api.applyUpdate).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(
      'A newer guide version was uploaded meanwhile. Review the update again.',
    );
  });

  it('shows the one-parse-at-a-time 429 with Try again', async () => {
    const { api, sheet, fixture, el, button } = await renderSheet();
    api.dryRunUpdate
      .mockRejectedValueOnce(
        new ApiError(429, 'rate-limited', 'Another guide is still being checked.'),
      )
      .mockResolvedValue(PREVIEW);
    await sheet.pick(file());
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Another guide is still being checked.',
    );
    button('Try again')!.click();
    await vi.waitFor(() => expect(api.dryRunUpdate).toHaveBeenCalledTimes(2));
  });

  it('waits for queued writes before allowing an update (§5.7)', async () => {
    const { store, fixture, el } = await renderSheet();
    store.setTaskState('lost-cat', 'done'); // unanswered: stays queued
    await fixture.whenStable();
    expect((el.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
    expect(el.textContent).toContain('Waiting for 1 unsaved change');
  });

  it('blocks Apply when writes were queued after the preview', async () => {
    const { api, sheet, store, fixture, el } = await renderSheet();
    api.dryRunUpdate.mockResolvedValue(PREVIEW);
    await sheet.pick(file());
    store.setTaskState('lost-cat', 'done');
    await sheet.apply();
    await fixture.whenStable();
    expect(api.applyUpdate).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('unsaved');
  });

  it('clears the file input so the same file can be picked again', async () => {
    const { api, fixture, el } = await renderSheet();
    api.dryRunUpdate.mockResolvedValue(PREVIEW);
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    // The test DOM has no DataTransfer, so stub `files` and record writes to `value`.
    const writes: string[] = [];
    Object.defineProperty(input, 'files', { value: [file()], configurable: true });
    Object.defineProperty(input, 'value', {
      set: (v: string) => void writes.push(v),
      get: () => '',
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(writes).toEqual(['']);
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(api.dryRunUpdate).toHaveBeenCalledTimes(2);
  });

  it('shows the issues of a 422 and offers no Apply', async () => {
    const { api, sheet, fixture, el, button } = await renderSheet();
    api.applyUpdate.mockRejectedValue(
      new ApiError(422, 'invalid-guide', 'Invalid guide.', [
        {
          severity: 'error',
          code: 'limit',
          message: 'Parsing took too long.',
          file: null,
          path: null,
          line: null,
          column: null,
        },
      ]),
    );
    api.dryRunUpdate.mockResolvedValue(PREVIEW);
    await sheet.pick(file());
    await sheet.apply();
    await fixture.whenStable();
    expect(el.textContent).toContain('Parsing took too long.');
    expect(button('Apply')).toBeUndefined();
  });

  it('shows other 409s (quota) without a second review', async () => {
    const { api, sheet, fixture, el } = await renderSheet();
    api.dryRunUpdate.mockRejectedValue(
      new ApiError(409, 'quota-versions', 'This run has too many guide versions.'),
    );
    await sheet.pick(file());
    await fixture.whenStable();
    expect(api.dryRunUpdate).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('too many guide versions');
  });
});
