import { Service, signal, type Signal } from '@angular/core';

export const TOAST_MS = 6_000;

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  id: number;
  message: string;
  action: ToastAction | null;
}
export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
  /** A new toast with the same key replaces the older one. */
  key?: string;
}

interface Item extends Toast {
  key: string | null;
}

@Service()
export class Toasts {
  private readonly items = signal<readonly Item[]>([]);
  readonly toasts: Signal<readonly Toast[]> = this.items.asReadonly();
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, options: ToastOptions = {}): number {
    const key = options.key ?? null;
    if (key !== null) {
      for (const item of this.items()) if (item.key === key) this.dismiss(item.id);
    }
    const id = ++this.nextId;
    this.items.update((list) => [...list, { id, message, action: options.action ?? null, key }]);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), options.durationMs ?? TOAST_MS),
    );
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  runAction(id: number): void {
    const toast = this.items().find((t) => t.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }
}
