import { TestBed } from '@angular/core/testing';
import { setupRunStore } from '../../testing/run-store-harness';
import { RunLayout } from './run-layout';

describe('RunLayout expansion epoch', () => {
  it('bumps only when the effective expansion changes', async () => {
    await setupRunStore({}, [RunLayout]);
    const layout = TestBed.inject(RunLayout);
    expect(layout.isExpanded('village')).toBe(true);
    layout.setExpanded('village', true);
    layout.resetLeaves(['village', null]);
    expect(layout.expansionEpoch('village')).toBe(0);
    layout.setExpanded('village', false);
    expect(layout.expansionEpoch('village')).toBe(1);
    layout.resetLeaves(['village']);
    expect(layout.expansionEpoch('village')).toBe(2);
  });
});
