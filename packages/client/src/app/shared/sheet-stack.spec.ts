import { TestBed } from '@angular/core/testing';
import { SheetStack } from './sheet-stack';

describe('SheetStack', () => {
  it('tracks the topmost sheet through nesting', () => {
    const stack = TestBed.inject(SheetStack);
    const a = {};
    const b = {};
    expect(stack.top()).toBeNull();
    expect(stack.isEmpty()).toBe(true);
    stack.push(a);
    stack.push(b);
    expect(stack.top()).toBe(b);
    expect(stack.isTop(a)).toBe(false);
    stack.remove(b);
    expect(stack.top()).toBe(a);
    stack.remove(a);
    expect(stack.top()).toBeNull();
    expect(stack.isEmpty()).toBe(true);
  });

  it('ignores duplicate pushes and unknown removals', () => {
    const stack = TestBed.inject(SheetStack);
    const a = {};
    stack.push(a);
    stack.push(a);
    stack.remove({});
    stack.remove(a);
    expect(stack.isEmpty()).toBe(true);
  });
});
