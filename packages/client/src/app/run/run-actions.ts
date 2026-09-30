/** What a card asks of its page (the page owns dialogs and toasts). Provided by RunPage. */
export abstract class RunActions {
  abstract requestClear(leafId: string): void;
  abstract requestPin(leafId: string): void;
  abstract unpin(): void;
}
